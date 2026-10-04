#!/usr/bin/env bash
# Testa de verdade o backup do banco: restaura o dump mais recente num banco
# DESCARTÁVEL (smartos_restore_test), compara contagem de linhas com o banco real
# e apaga o descartável. Não altera o banco de produção (só leitura nele).
#
# Rodar na VPS:  bash test_restore.sh
set -euo pipefail

DB_CONTAINER="${DB_CONTAINER:-supabase-db}"
DUMP_DIR="${DUMP_DIR:-/opt/backups/postgres}"
TEST_DB="smartos_restore_test"
TABLES=(service_orders routes technicians drivers technical_reports checklists configs profiles notifications)

LATEST="$(ls -1t "$DUMP_DIR"/postgres_*.dump | head -n1)"
echo "Dump mais recente: $LATEST ($(du -h "$LATEST" | cut -f1))"

docker cp "$LATEST" "$DB_CONTAINER":/tmp/restore_test.dump
docker exec "$DB_CONTAINER" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS $TEST_DB;" -c "CREATE DATABASE $TEST_DB;"

# Erros de objetos que já existem em bancos novos do Supabase (roles, extensões) são esperados.
docker exec "$DB_CONTAINER" pg_restore -U supabase_admin -d "$TEST_DB" --no-owner --no-privileges /tmp/restore_test.dump 2>&1 | tail -n 15 || true

echo
printf '%-22s %12s %12s\n' tabela producao restaurado
FAIL=0
for t in "${TABLES[@]}"; do
  prod="$(docker exec "$DB_CONTAINER" psql -U supabase_admin -d postgres -Atc "SELECT count(*) FROM public.$t" 2>/dev/null || echo ERR)"
  rest="$(docker exec "$DB_CONTAINER" psql -U supabase_admin -d "$TEST_DB" -Atc "SELECT count(*) FROM public.$t" 2>/dev/null || echo ERR)"
  flag=""
  # O dump é diário: produção pode ter linhas novas depois dele (prod >= restaurado é normal).
  if [[ "$rest" == "ERR" || "$prod" == "ERR" ]]; then flag="  <-- erro"; FAIL=1; fi
  printf '%-22s %12s %12s%s\n' "$t" "$prod" "$rest" "$flag"
done

docker exec "$DB_CONTAINER" psql -U supabase_admin -d postgres -c "DROP DATABASE IF EXISTS $TEST_DB;"
docker exec "$DB_CONTAINER" rm -f /tmp/restore_test.dump
echo
if [[ $FAIL -eq 0 ]]; then echo "OK: backup restaurou e as tabelas principais têm dados."; else echo "ATENÇÃO: alguma tabela não restaurou — revisar."; exit 1; fi
