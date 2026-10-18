#!/usr/bin/env bash
#
# Deploy Agent Commons to Cloud Run, from a project id and nothing else.
#
#   ./scripts/deploy-cloudrun.sh YOUR_PROJECT_ID
#
# Every step is idempotent: running it twice is safe, and it can be re-run after
# a failure without unpicking anything. It does not touch billing — that has to
# exist before this script runs, and there is no way around it.
#
# What it does, in order: check the caller is authenticated, pin the project,
# enable the four APIs, create the Firestore database if there is not one,
# deploy, then print the URL to hand to scripts/verify-deploy.mjs.
set -euo pipefail

GCLOUD="${GCLOUD:-$(command -v gcloud || echo "$HOME/google-cloud-sdk/bin/gcloud")}"
PROJECT="${1:-}"
REGION="asia-east1"
# SERVICE can be overridden so a risky branch can be deployed beside the
# submission URL instead of on top of it: SERVICE=agent-commons-auth.
SERVICE="${SERVICE:-agent-commons}"

if [[ -z "$PROJECT" ]]; then
  echo "usage: $0 YOUR_PROJECT_ID" >&2
  exit 2
fi

echo "== 0. authenticated as =="
ACCOUNT="$("$GCLOUD" auth list --filter=status:ACTIVE --format='value(account)' | head -n1)"
if [[ -z "$ACCOUNT" ]]; then
  echo "No active gcloud account. Run: $GCLOUD auth login" >&2
  exit 1
fi
echo "$ACCOUNT"

echo "== 1. project =="
"$GCLOUD" config set project "$PROJECT" --quiet
# Fail loudly here rather than four steps later: an unbilled project is the one
# thing this script cannot fix.
BILLING="$("$GCLOUD" billing projects describe "$PROJECT" --format='value(billingEnabled)' 2>/dev/null || echo unknown)"
if [[ "$BILLING" != "True" ]]; then
  echo "WARNING: billing does not look enabled on $PROJECT (got: $BILLING)." >&2
  echo "         Cloud Run will refuse to deploy. Continuing anyway, so the error is explicit." >&2
fi

echo "== 2. enable APIs =="
"$GCLOUD" services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  firestore.googleapis.com \
  --project "$PROJECT"

echo "== 3. Firestore database =="
if "$GCLOUD" firestore databases describe --database="(default)" --project "$PROJECT" >/dev/null 2>&1; then
  echo "already exists, leaving it alone"
else
  # Location is permanent. asia-east1 matches the Cloud Run region.
  "$GCLOUD" firestore databases create \
    --location="$REGION" \
    --type=firestore-native \
    --project "$PROJECT"
fi

echo "== 4. deploy =="
# 1Gi rather than the 512Mi in the runbook: Next.js SSR plus firebase-admin/grpc
# is close enough to the line that a cold start could be killed for memory, and
# this is not the moment to find out. The difference in cost is fractions of a cent.
#
# --allow-unauthenticated  the organisers require judges to open the link directly
# --max-instances 1        sign-off history is still process memory; see runbook
# TRANSPORT=firestore      otherwise Firestore is installed, not used
#
# GEMINI_API_KEY is optional and read from the caller's environment, so the key
# never has to be pasted into a command line or typed into a console. Without it
# the guide answers from the deterministic fallback and labels itself as such.
#
# --set-env-vars REPLACES the whole set: anything set by hand in the console is
# wiped by the next deploy. This script is the single source of truth for env,
# which is exactly why the key has to be carried here rather than bolted on.
ENV_VARS="TRANSPORT=firestore,FIRESTORE_PROJECT_ID=${PROJECT},FIRESTORE_COLLECTION=agent_commons"
if [[ -n "${GEMINI_API_KEY:-}" ]]; then
  ENV_VARS="${ENV_VARS},GEMINI_API_KEY=${GEMINI_API_KEY}"
  echo "GEMINI_API_KEY: present, will be set on the service"
else
  echo "GEMINI_API_KEY: not set — the guide will answer from the deterministic fallback"
fi

# The model id is part of the answer the panel reports, so it has to be the same
# one that was tested locally. Left unset the code falls back to its default,
# which may not be the model anyone actually checked.
if [[ -n "${GEMINI_MODEL:-}" ]]; then
  ENV_VARS="${ENV_VARS},GEMINI_MODEL=${GEMINI_MODEL}"
  echo "GEMINI_MODEL: ${GEMINI_MODEL}"
fi

# A project scaffolded in AI Studio usually has a named Firestore database, not
# "(default)". Reading the wrong one is silent — an empty board, which reads as a
# broken deploy. Forward the id when the caller knows it.
if [[ -n "${FIRESTORE_DATABASE_ID:-}" ]]; then
  ENV_VARS="${ENV_VARS},FIRESTORE_DATABASE_ID=${FIRESTORE_DATABASE_ID}"
  echo "FIRESTORE_DATABASE_ID: ${FIRESTORE_DATABASE_ID}"
fi

# The Firebase client config is a BUILD-time value, not a runtime one: Next.js
# inlines NEXT_PUBLIC_* into the browser bundle, so a runtime env var reaches
# nothing. --source deploys carry build values with --set-build-env-vars, so
# forward any that the caller exported.
#
# This matters because the failure is silent: the bundle falls back to
# `AIzaSyPlaceholderBuildTimeKey`, the image builds and serves fine, and only
# the sign-in button is broken. Read through printenv so an unset variable is
# simply absent rather than a `set -u` abort.
BUILD_VARS=""
for name in \
  NEXT_PUBLIC_FIREBASE_API_KEY \
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN \
  NEXT_PUBLIC_FIREBASE_PROJECT_ID \
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET \
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID \
  NEXT_PUBLIC_FIREBASE_APP_ID \
  NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID \
  NEXT_PUBLIC_FIREBASE_DATABASE_ID; do
  value="$(printenv "$name" || true)"
  if [[ -n "$value" ]]; then
    BUILD_VARS="${BUILD_VARS:+$BUILD_VARS,}${name}=${value}"
  fi
done

BUILD_ARGS=()
if [[ -n "$BUILD_VARS" ]]; then
  BUILD_ARGS=(--set-build-env-vars "$BUILD_VARS")
  echo "build-time config: ${BUILD_ARGS[*]}"
else
  echo "build-time config: none supplied — the client bundle will carry placeholder Firebase values"
  echo "                    export NEXT_PUBLIC_FIREBASE_* before running this if sign-in must work"
fi

"$GCLOUD" run deploy "$SERVICE" \
  --source . \
  --project "$PROJECT" \
  --region "$REGION" \
  --allow-unauthenticated \
  --port 8080 \
  --memory 1Gi \
  --cpu 1 \
  --max-instances 1 \
  --set-env-vars "$ENV_VARS" \
  ${BUILD_ARGS[@]+"${BUILD_ARGS[@]}"} \
  --quiet

echo "== 5. url =="
URL="$("$GCLOUD" run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format='value(status.url)')"
echo "$URL"
echo
echo "Next: node scripts/verify-deploy.mjs $URL"
