#!/bin/sh
# 14 SEG-08: o app não é dono das tabelas. Roda uma vez, no primeiro boot do volume do Postgres
# (docker-entrypoint-initdb.d) e no CI. Em produção, defina APP_OWNER_SENHA e APP_RW_SENHA.
set -eu
PSQL="psql -v ON_ERROR_STOP=1 --username ${POSTGRES_USER} --no-password"

$PSQL --dbname "${POSTGRES_DB}" <<SQL
CREATE ROLE app_owner LOGIN NOSUPERUSER NOCREATEROLE CREATEDB PASSWORD '${APP_OWNER_SENHA:-app_owner}';
CREATE ROLE app_rw LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${APP_RW_SENHA:-app_rw}';
ALTER DATABASE "${POSTGRES_DB}" OWNER TO app_owner;
ALTER SCHEMA public OWNER TO app_owner;
SQL

# Banco dos testes de integração (dev e CI), com o mesmo desenho de papéis.
if [ "${CRIAR_BANCO_TESTE:-1}" = "1" ]; then
  $PSQL --dbname "${POSTGRES_DB}" -c "CREATE DATABASE ${POSTGRES_DB}_teste OWNER app_owner"
  $PSQL --dbname "${POSTGRES_DB}_teste" -c "ALTER SCHEMA public OWNER TO app_owner"
fi
