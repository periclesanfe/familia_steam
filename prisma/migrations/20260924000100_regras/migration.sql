-- Regras que o Prisma não expressa: índices parciais, CHECKs, triggers (docs/spec/05 §3).
-- Unicidades parciais
CREATE UNIQUE INDEX membro_um_vinculo_aberto ON membro ("pessoaId") WHERE status <> 'ENCERRADO';
CREATE UNIQUE INDEX rodada_sequencia_unica ON rodada ("cicloId", sequencia) WHERE status NOT IN ('ANULADA','CANCELADA');
CREATE UNIQUE INDEX rodada_mes_unico ON rodada ("cicloId", "mesReferencia") WHERE status NOT IN ('ANULADA','CANCELADA');
CREATE UNIQUE INDEX votacao_aberta_por_objeto ON votacao (assunto, "chaveObjeto") WHERE status = 'ABERTA';
CREATE UNIQUE INDEX veto_unico_por_aviso ON votacao ("chaveObjeto") WHERE assunto = 'VETO_JOGO' AND status <> 'CANCELADA';
CREATE UNIQUE INDEX contribuicao_por_devedor ON obrigacao ("rodadaId", "devedorId") WHERE tipo = 'CONTRIBUICAO' AND "canceladaEm" IS NULL;
CREATE UNIQUE INDEX sobra_unica ON obrigacao ("rodadaOrigemId", "aquisicaoReembolsoId") NULLS NOT DISTINCT WHERE tipo = 'SOBRA' AND "canceladaEm" IS NULL;
CREATE UNIQUE INDEX rateio_unico ON obrigacao ("rodadaOrigemId", "credorId", "aquisicaoReembolsoId") NULLS NOT DISTINCT WHERE tipo = 'RATEIO_SOBRA' AND "canceladaEm" IS NULL;
CREATE UNIQUE INDEX obrigacao_por_pagamento ON obrigacao ("pagamentoOrigemId") WHERE "pagamentoOrigemId" IS NOT NULL AND "canceladaEm" IS NULL;
CREATE UNIQUE INDEX declaracao_rodada_ativa ON declaracao (tipo, "pessoaId", "rodadaId")
  WHERE "revogadaEm" IS NULL AND "rodadaId" IS NOT NULL AND tipo IN ('NAO_CONCORRER','JUSTIFICATIVA_PRORROGACAO');
CREATE UNIQUE INDEX justificativa_por_obrigacao ON declaracao ("obrigacaoId")
  WHERE "revogadaEm" IS NULL AND "obrigacaoId" IS NOT NULL AND tipo = 'JUSTIFICATIVA_PRORROGACAO';
CREATE UNIQUE INDEX confirmacao_ciclo_ativa ON declaracao ("pessoaId", "cicloId")
  WHERE "revogadaEm" IS NULL AND tipo IN ('CONFIRMA_PROXIMO_CICLO','RECUSA_PROXIMO_CICLO');
CREATE UNIQUE INDEX cessao_ativa_por_rodada ON cessao ("rodadaId") WHERE status IN ('AGUARDANDO_ACEITE','EM_VOTACAO');
CREATE UNIQUE INDEX aviso_ativo_por_rodada ON aviso_compra ("rodadaId") WHERE "substituidoEm" IS NULL;

-- Integridade
ALTER TABLE obrigacao ADD CONSTRAINT obrigacao_valor_positivo CHECK ("valorCentavos" > 0);
ALTER TABLE obrigacao ADD CONSTRAINT obrigacao_partes CHECK (("devedorId" = "credorId") = autoquitada);
ALTER TABLE pagamento ADD CONSTRAINT pagamento_valor_positivo CHECK ("valorCentavos" > 0);
ALTER TABLE pagamento ADD CONSTRAINT pagamento_comprovante CHECK ("comprovanteId" IS NOT NULL OR "formaDiversa");
ALTER TABLE aquisicao ADD CONSTRAINT aquisicao_valor CHECK ("valorCentavos" > 0);
ALTER TABLE aquisicao ADD CONSTRAINT aquisicao_reembolso
  CHECK ("reembolsoValorCentavos" IS NULL OR "reembolsoValorCentavos" BETWEEN 1 AND "valorCentavos");
ALTER TABLE pessoa ADD CONSTRAINT pessoa_steamid CHECK ("steamId64" IS NULL OR
  ("steamId64" ~ '^[0-9]{17}$' AND "steamId64"::bigint BETWEEN 76561197960265729 AND 76561202255233023));
ALTER TABLE ciclo ADD CONSTRAINT ciclo_dia3 CHECK (EXTRACT(DAY FROM "dataInicio") = 3);
ALTER TABLE votacao ADD CONSTRAINT votacao_quorum CHECK (quorum = n / 2 + 1);

-- Só inserção
CREATE FUNCTION bloquear_mutacao() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Tabela % é somente-inserção', TG_TABLE_NAME; END $$;
CREATE TRIGGER sorteio_imutavel   BEFORE UPDATE OR DELETE ON sorteio          FOR EACH ROW EXECUTE FUNCTION bloquear_mutacao();
CREATE TRIGGER voto_imutavel      BEFORE UPDATE OR DELETE ON voto             FOR EACH ROW EXECUTE FUNCTION bloquear_mutacao();
CREATE TRIGGER ata_imutavel       BEFORE UPDATE OR DELETE ON ata              FOR EACH ROW EXECUTE FUNCTION bloquear_mutacao();
CREATE TRIGGER adesao_imutavel    BEFORE UPDATE OR DELETE ON adesao           FOR EACH ROW EXECUTE FUNCTION bloquear_mutacao();
CREATE TRIGGER auditoria_imutavel BEFORE UPDATE OR DELETE ON evento_auditoria FOR EACH ROW EXECUTE FUNCTION bloquear_mutacao();
-- Sem DELETE em registros de negócio
CREATE FUNCTION bloquear_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'DELETE proibido em %', TG_TABLE_NAME; END $$;
CREATE TRIGGER obrigacao_sem_delete BEFORE DELETE ON obrigacao    FOR EACH ROW EXECUTE FUNCTION bloquear_delete();
CREATE TRIGGER pagamento_sem_delete BEFORE DELETE ON pagamento    FOR EACH ROW EXECUTE FUNCTION bloquear_delete();
CREATE TRIGGER aviso_sem_delete     BEFORE DELETE ON aviso_compra FOR EACH ROW EXECUTE FUNCTION bloquear_delete();
CREATE TRIGGER aquisicao_sem_delete BEFORE DELETE ON aquisicao    FOR EACH ROW EXECUTE FUNCTION bloquear_delete();

-- Linhas de controle técnico
INSERT INTO controle (chave, "atualizadoEm") VALUES ('tick', now()), ('steam_pausa', now()), ('ultimo_tick', now());
