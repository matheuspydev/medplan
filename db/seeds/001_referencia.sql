-- =============================================================================
-- MedPlan | Seeds de vocabulário de referência
-- SQL portável: roda igual em PostgreSQL e SQLite.
--
-- >>> CONFERIR ANTES DE USO REAL <<<
--   - CID-10: conferir contra a tabela oficial do DATASUS/CID-10 OMS.
--   - ATC:    conferir contra o WHO ATC/DDD Index vigente.
--   - MedDRA: `codigo_meddra_pt` fica NULL de propósito. MedDRA é dicionário
--             licenciado (MSSO); os códigos precisam vir da versão assinada,
--             não de memória. Os termos abaixo são rótulos de trabalho a serem
--             mapeados para o Preferred Term correto.
-- Esta lista é um recorte de trabalho para a fase 0, não um catálogo completo.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Faixas etárias  (ordem = adjacência, usada pelo relaxamento do matching)
-- -----------------------------------------------------------------------------
INSERT INTO faixa_etaria (codigo, rotulo, idade_min, idade_max, ordem) VALUES
    ('12_17',   '12 a 17 anos', 12,  17, 1),
    ('18_25',   '18 a 25 anos', 18,  25, 2),
    ('26_35',   '26 a 35 anos', 26,  35, 3),
    ('36_50',   '36 a 50 anos', 36,  50, 4),
    ('51_65',   '51 a 65 anos', 51,  65, 5),
    ('66_mais', '66 anos ou mais', 66, 120, 6);

-- -----------------------------------------------------------------------------
-- Faixas de IMC  (relevante para reação adversa metabólica de antipsicóticos)
-- -----------------------------------------------------------------------------
INSERT INTO faixa_imc (codigo, rotulo, imc_min, imc_max, ordem) VALUES
    ('baixo_peso',    'Baixo peso (< 18,5)',        NULL, 18.4, 1),
    ('eutrofico',     'Eutrófico (18,5 a 24,9)',    18.5, 24.9, 2),
    ('sobrepeso',     'Sobrepeso (25,0 a 29,9)',    25.0, 29.9, 3),
    ('obesidade_1',   'Obesidade grau I (30 a 34,9)', 30.0, 34.9, 4),
    ('obesidade_2_3', 'Obesidade grau II/III (>= 35)', 35.0, NULL, 5);

-- -----------------------------------------------------------------------------
-- CID-10 — diagnósticos psiquiátricos principais
-- -----------------------------------------------------------------------------
INSERT INTO cid10 (codigo, descricao, grupo) VALUES
    ('F20.0', 'Esquizofrenia paranoide',                                'F20-F29'),
    ('F20.9', 'Esquizofrenia não especificada',                         'F20-F29'),
    ('F25.0', 'Transtorno esquizoafetivo do tipo maníaco',              'F20-F29'),
    ('F31.1', 'Transtorno afetivo bipolar, episódio maníaco sem sintomas psicóticos', 'F30-F39'),
    ('F31.3', 'Transtorno afetivo bipolar, episódio depressivo leve ou moderado',     'F30-F39'),
    ('F31.9', 'Transtorno afetivo bipolar não especificado',            'F30-F39'),
    ('F32.1', 'Episódio depressivo moderado',                           'F30-F39'),
    ('F32.2', 'Episódio depressivo grave sem sintomas psicóticos',      'F30-F39'),
    ('F33.1', 'Transtorno depressivo recorrente, episódio moderado',    'F30-F39'),
    ('F33.2', 'Transtorno depressivo recorrente, episódio grave sem sintomas psicóticos', 'F30-F39'),
    ('F40.1', 'Fobia social',                                           'F40-F48'),
    ('F41.0', 'Transtorno de pânico',                                   'F40-F48'),
    ('F41.1', 'Transtorno de ansiedade generalizada',                   'F40-F48'),
    ('F42.2', 'Transtorno obsessivo-compulsivo com pensamentos e atos obsessivos mistos', 'F40-F48'),
    ('F43.1', 'Estado de estresse pós-traumático',                      'F40-F48'),
    ('F60.3', 'Transtorno de personalidade com instabilidade emocional', 'F60-F69'),
    ('F90.0', 'Distúrbios da atividade e da atenção',                   'F90-F98');

-- CID-10 — comorbidades clínicas e de uso de substâncias
INSERT INTO cid10 (codigo, descricao, grupo) VALUES
    ('F10.2', 'Transtornos mentais devidos ao uso de álcool: síndrome de dependência', 'F10-F19'),
    ('F17.2', 'Transtornos mentais devidos ao uso de tabaco: síndrome de dependência', 'F10-F19'),
    ('E03.9', 'Hipotireoidismo não especificado',                       'E00-E07'),
    ('E11.9', 'Diabetes mellitus tipo 2 sem complicações',              'E10-E14'),
    ('E66.9', 'Obesidade não especificada',                             'E65-E68'),
    ('E78.5', 'Hiperlipidemia não especificada',                        'E70-E90'),
    ('G40.9', 'Epilepsia não especificada',                             'G40-G47'),
    ('I10',   'Hipertensão essencial (primária)',                       'I10-I15'),
    ('K76.0', 'Degeneração gordurosa do fígado não classificada em outra parte', 'K70-K77'),
    ('N18.9', 'Doença renal crônica não especificada',                  'N17-N19');

-- -----------------------------------------------------------------------------
-- Medicamentos  (ATC — conferir contra o WHO ATC/DDD Index)
-- -----------------------------------------------------------------------------
INSERT INTO medicamento (principio_ativo, codigo_atc, classe_terapeutica) VALUES
    ('sertralina',      'N06AB06', 'Antidepressivo ISRS'),
    ('fluoxetina',      'N06AB03', 'Antidepressivo ISRS'),
    ('escitalopram',    'N06AB10', 'Antidepressivo ISRS'),
    ('paroxetina',      'N06AB05', 'Antidepressivo ISRS'),
    ('venlafaxina',     'N06AX16', 'Antidepressivo IRSN'),
    ('duloxetina',      'N06AX21', 'Antidepressivo IRSN'),
    ('bupropiona',      'N06AX12', 'Antidepressivo IRND'),
    ('mirtazapina',     'N06AX11', 'Antidepressivo noradrenérgico e serotoninérgico específico'),
    ('amitriptilina',   'N06AA09', 'Antidepressivo tricíclico'),
    ('nortriptilina',   'N06AA10', 'Antidepressivo tricíclico'),
    ('quetiapina',      'N05AH04', 'Antipsicótico de segunda geração'),
    ('olanzapina',      'N05AH03', 'Antipsicótico de segunda geração'),
    ('risperidona',     'N05AX08', 'Antipsicótico de segunda geração'),
    ('aripiprazol',     'N05AX12', 'Antipsicótico de segunda geração'),
    ('clozapina',       'N05AH02', 'Antipsicótico de segunda geração'),
    ('haloperidol',     'N05AD01', 'Antipsicótico de primeira geração'),
    ('carbonato de lítio', 'N05AN01', 'Estabilizador de humor'),
    ('ácido valproico', 'N03AG01', 'Anticonvulsivante estabilizador de humor'),
    ('lamotrigina',     'N03AX09', 'Anticonvulsivante estabilizador de humor'),
    ('carbamazepina',   'N03AF01', 'Anticonvulsivante estabilizador de humor'),
    ('clonazepam',      'N03AE01', 'Benzodiazepínico'),
    ('metilfenidato',   'N06BA04', 'Psicoestimulante'),
    ('lisdexanfetamina','N06BA12', 'Psicoestimulante');

-- -----------------------------------------------------------------------------
-- Reações adversas  (termo de trabalho + SOC; código MedDRA pendente de licença)
-- -----------------------------------------------------------------------------
INSERT INTO reacao_adversa (termo, codigo_meddra_pt, soc, gravidade_padrao) VALUES
    ('Ganho de peso',                   NULL, 'Exames complementares',                          'moderada'),
    ('Sonolência',                      NULL, 'Distúrbios do sistema nervoso',                  'leve'),
    ('Insônia',                         NULL, 'Distúrbios psiquiátricos',                       'leve'),
    ('Náusea',                          NULL, 'Distúrbios gastrintestinais',                    'leve'),
    ('Boca seca',                       NULL, 'Distúrbios gastrintestinais',                    'leve'),
    ('Constipação',                     NULL, 'Distúrbios gastrintestinais',                    'leve'),
    ('Disfunção sexual',                NULL, 'Distúrbios do sistema reprodutivo e das mamas',  'moderada'),
    ('Tremor',                          NULL, 'Distúrbios do sistema nervoso',                  'moderada'),
    ('Acatisia',                        NULL, 'Distúrbios do sistema nervoso',                  'moderada'),
    ('Sintomas extrapiramidais',        NULL, 'Distúrbios do sistema nervoso',                  'grave'),
    ('Discinesia tardia',               NULL, 'Distúrbios do sistema nervoso',                  'grave'),
    ('Cefaleia',                        NULL, 'Distúrbios do sistema nervoso',                  'leve'),
    ('Tontura',                         NULL, 'Distúrbios do sistema nervoso',                  'leve'),
    ('Agitação',                        NULL, 'Distúrbios psiquiátricos',                       'moderada'),
    ('Ideação suicida',                 NULL, 'Distúrbios psiquiátricos',                       'grave'),
    ('Hiperprolactinemia',              NULL, 'Distúrbios endócrinos',                          'moderada'),
    ('Dislipidemia',                    NULL, 'Distúrbios do metabolismo e da nutrição',        'moderada'),
    ('Hiperglicemia',                   NULL, 'Distúrbios do metabolismo e da nutrição',        'moderada'),
    ('Hiponatremia',                    NULL, 'Distúrbios do metabolismo e da nutrição',        'grave'),
    ('Agranulocitose',                  NULL, 'Distúrbios do sangue e do sistema linfático',    'grave'),
    ('Prolongamento do intervalo QT',   NULL, 'Exames complementares',                          'grave'),
    ('Elevação de transaminases',       NULL, 'Exames complementares',                          'moderada'),
    ('Exantema',                        NULL, 'Distúrbios da pele e do tecido subcutâneo',      'moderada'),
    ('Síndrome de Stevens-Johnson',     NULL, 'Distúrbios da pele e do tecido subcutâneo',      'grave'),
    ('Sudorese',                        NULL, 'Distúrbios da pele e do tecido subcutâneo',      'leve'),
    ('Hipotensão ortostática',          NULL, 'Distúrbios vasculares',                          'moderada');
