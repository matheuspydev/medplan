CREATE TABLE "fato_tratamento" (
  "sk_tratamento" integer PRIMARY KEY,
  "sk_perfil" integer NOT NULL,
  "sk_medicamento" integer NOT NULL,
  "sk_cid_principal" integer NOT NULL,
  "sk_tempo_inicio" integer NOT NULL,
  "status" varchar NOT NULL,
  "linha_tratamento" smallint,
  "dias_observados" integer NOT NULL,
  "avaliavel_horizonte" smallint NOT NULL,
  "permaneceu_horizonte" smallint NOT NULL,
  "censurado_horizonte" smallint NOT NULL,
  "qtd_reacoes" smallint NOT NULL
);

CREATE TABLE "fato_reacao_adversa" (
  "sk_reacao_fato" integer PRIMARY KEY,
  "sk_tratamento" integer NOT NULL,
  "sk_reacao" integer NOT NULL,
  "dias_ate_inicio" integer,
  "gravidade_observada" varchar NOT NULL,
  "levou_descontinuacao" smallint NOT NULL
);

CREATE TABLE "dim_perfil_paciente" (
  "sk_perfil" integer PRIMARY KEY,
  "faixa_etaria" varchar NOT NULL,
  "sexo" varchar NOT NULL,
  "faixa_imc" varchar,
  "tabagismo" varchar NOT NULL,
  "qtd_comorbidades" smallint NOT NULL
);

CREATE TABLE "dim_cid10" (
  "sk_cid" integer PRIMARY KEY,
  "codigo" varchar NOT NULL,
  "descricao" varchar NOT NULL,
  "grupo" varchar NOT NULL,
  "tipo" varchar NOT NULL
);

CREATE TABLE "dim_medicamento" (
  "sk_medicamento" integer PRIMARY KEY,
  "principio_ativo" varchar NOT NULL,
  "classe_terapeutica" varchar NOT NULL,
  "codigo_atc" varchar NOT NULL
);

CREATE TABLE "dim_reacao_adversa" (
  "sk_reacao" integer PRIMARY KEY,
  "termo" varchar NOT NULL,
  "soc" varchar NOT NULL,
  "gravidade_padrao" varchar NOT NULL
);

CREATE TABLE "dim_tempo" (
  "sk_tempo" integer PRIMARY KEY,
  "data" date NOT NULL,
  "mes" smallint NOT NULL,
  "trimestre" smallint NOT NULL,
  "ano" smallint NOT NULL
);

CREATE TABLE "ponte_perfil_comorbidade" (
  "sk_perfil" integer NOT NULL,
  "sk_cid" integer NOT NULL,
  "tipo" varchar NOT NULL,
  PRIMARY KEY ("sk_perfil", "sk_cid")
);

COMMENT ON COLUMN "fato_tratamento"."status" IS 'em uso, concluído, descontinuado por reação adversa, por ineficácia, por não adesão, outro, perdido de seguimento';

COMMENT ON COLUMN "fato_tratamento"."avaliavel_horizonte" IS 'denominador da taxa';

COMMENT ON COLUMN "fato_tratamento"."permaneceu_horizonte" IS 'numerador da taxa';

COMMENT ON COLUMN "fato_tratamento"."censurado_horizonte" IS 'seguimento curto: fica fora do denominador';

COMMENT ON TABLE "dim_perfil_paciente" IS 'Pseudonimizado: sem nome, CPF, prontuário, nascimento ou endereço.';

COMMENT ON TABLE "dim_cid10" IS 'Dois papéis: diagnóstico principal no fato e comorbidade pela ponte.';

COMMENT ON COLUMN "dim_cid10"."grupo" IS 'ex.: F30-F39';

COMMENT ON COLUMN "dim_cid10"."tipo" IS 'psiquiatrica | clinica';

COMMENT ON COLUMN "dim_tempo"."sk_tempo" IS 'aaaammdd';

COMMENT ON TABLE "ponte_perfil_comorbidade" IS 'Comorbidade é muitos-para-muitos; sem a ponte o fato duplicaria.';

ALTER TABLE "fato_tratamento" ADD FOREIGN KEY ("sk_perfil") REFERENCES "dim_perfil_paciente" ("sk_perfil") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fato_tratamento" ADD FOREIGN KEY ("sk_medicamento") REFERENCES "dim_medicamento" ("sk_medicamento") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fato_tratamento" ADD FOREIGN KEY ("sk_cid_principal") REFERENCES "dim_cid10" ("sk_cid") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fato_tratamento" ADD FOREIGN KEY ("sk_tempo_inicio") REFERENCES "dim_tempo" ("sk_tempo") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fato_reacao_adversa" ADD FOREIGN KEY ("sk_tratamento") REFERENCES "fato_tratamento" ("sk_tratamento") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "fato_reacao_adversa" ADD FOREIGN KEY ("sk_reacao") REFERENCES "dim_reacao_adversa" ("sk_reacao") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "ponte_perfil_comorbidade" ADD FOREIGN KEY ("sk_perfil") REFERENCES "dim_perfil_paciente" ("sk_perfil") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "ponte_perfil_comorbidade" ADD FOREIGN KEY ("sk_cid") REFERENCES "dim_cid10" ("sk_cid") DEFERRABLE INITIALLY IMMEDIATE;
