#!/bin/sh
# Creates a dedicated database used by the backend integration test suite so that
# running `npm test` never touches development data.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE ${POSTGRES_DB}_test;
EOSQL
