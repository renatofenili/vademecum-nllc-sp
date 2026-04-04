import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { analyzeEditalText, extractCriterio, extractOrgao } from "./index.ts";

const fixtureText = `
PREFEITURA MUNICIPAL DE ALFA
SECRETARIA DE ADMINISTRAÇÃO, publicada no D.O.U. de 04 de março de 2021, realizará licitação, na modalidade PREGÃO, na forma ELETRÔNICA.
EDITAL 06/2021

1. OBJETO
1.1. Descrição. A presente licitação tem por objeto a Aquisição de Armários, Mesas, Gaveteiros, Bancada e Entre Outros, conforme especificações constantes do Termo de Referência que integra este Edital como Anexo I.

1.2. Os pagamentos decorrentes de despesas cujos valores estejam corretos serão realizados em até 30 dias.

Critério de julgamento: menor preço global.
Sessão pública: 15/03/2025 às 10h.
Plataforma: Licitações-e (Banco do Brasil).
Documentos de habilitação: ato constitutivo, CNPJ, certidão federal, FGTS, CNDT, atestado de capacidade técnica e balanço patrimonial.
`;

const ministerioFixture = `
14198006 08084.000594/2021-11
Ministério da Justiça e Segurança Pública
Esplanada dos Ministérios, Bloco T, Anexo II, 6º Andar, Sala 621 - Bairro Zona Cívico Administrativa,
Brasília/DF, CEP 70064-900
Telefone: (61) 2025-9301 - https://www.justica.gov.br

EDITAL DE LICITAÇÃO
PREGÃO ELETRÔNICO Nº 06/2021
PROCESSO Nº 08084.000594/2021-11

Torna-se público, para conhecimento dos interessados, que a União, por intermédio do Ministério da Justiça e Segurança Pública, por meio do Pregoeiro designado pela Portaria nº 26 de 01 de março de 2021.
`;

const ministerioAsciiFixture = `
14198006 08084.000594/2021-11
Ministerio da Justica e Seguranca Publica
Esplanada dos Ministerios, Bloco T, Anexo II, 6o Andar, Sala 621
Brasilia/DF, CEP 70064-900

EDITAL DE LICITACAO
PREGAO ELETRONICO No 06/2021
PROCESSO No 08084.000594/2021-11

Torna-se publico, para conhecimento dos interessados, que a Uniao, por intermedio do Ministerio da Justica e Seguranca Publica.
`;

Deno.test("extractOrgao removes publication and bidding tail", () => {
  const value = extractOrgao(fixtureText);
  assertEquals(value, "Secretaria de Administração");
});

Deno.test("extractOrgao identifies ministry from institutional header and preamble", () => {
  const value = extractOrgao(ministerioFixture);
  assertEquals(value, "Ministério da Justiça e Segurança Pública");
});

Deno.test("extractOrgao identifies ministry from ascii extraction too", () => {
  const value = extractOrgao(ministerioAsciiFixture);
  assertEquals(value, "Ministerio da Justica e Seguranca Publica");
});

Deno.test("extractCriterio identifies labeled criterion with qualifier", () => {
  const value = extractCriterio(`Para julgamento e classificação das propostas será adotado o critério de menor preço por item.`);
  assertEquals(value, "Menor preço por item");
});

Deno.test("analyzeEditalText produces grounded summary from fixture text", () => {
  const result = analyzeEditalText(fixtureText);

  assertEquals(result.orgao, "Secretaria de Administração");
  assertEquals(result.criterio_julgamento, "Menor preço global");
  assertStringIncludes(result.objeto, "Aquisição de Armários");
  // 16-section format checks
  assertStringIncludes(result.resumo_simples, "VISÃO GERAL DO EDITAL");
  assertStringIncludes(result.resumo_simples, "EM UMA FRASE");
  assertStringIncludes(result.resumo_simples, "LEITURA IMEDIATA");
  assertStringIncludes(result.resumo_simples, "DIAGNÓSTICO EXECUTIVO");
  assertStringIncludes(result.resumo_simples, "COMO A DISPUTA FUNCIONA");
  assertStringIncludes(result.resumo_simples, "QUEM PODE PARTICIPAR");
  assertStringIncludes(result.resumo_simples, "CONCLUSÃO EXECUTIVA");
  assertStringIncludes(result.resumo_simples, "Secretaria de Administração");
  assertStringIncludes(result.resumo_simples, "menor preço global");
  // Truth-grounding: must not invent SRP or consórcio without base
  assert(!result.resumo_simples.includes("Imagine que"));
  // Consórcio should be "não identificado" since fixture doesn't mention it
  assertStringIncludes(result.resumo_simples, "Consórcio: não identificado");
});
