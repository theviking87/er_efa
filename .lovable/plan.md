## O que vou construir

### 1. Gestão de presenças / faltas por sessão
- Na página do curso, em cada sessão do cronograma adicionar botão **"Presenças"**.
- Abre diálogo com lista de formandos inscritos nesse curso (ativos), com 3 estados por formando: **Presente / Falta justificada / Falta injustificada** + campo de observações.
- Guarda em `formando_faltas` (tabela já existente) com `sessao_id`, `formando_id`, `tipo`, `horas` (= horas da sessão), `data`, `motivo`.
- Indicador visual na sessão (badge) quando já tem presenças marcadas.

### 2. Dashboard com KPIs
Substituir o dashboard atual por cartões com:
- Cursos a decorrer (hoje entre `data_inicio` e `data_fim`)
- Formadores ativos no mês
- Horas lecionadas no mês (soma de `sessoes.horas`)
- UFCDs em curso (não concluídas com sessões marcadas)
- Próximas sessões (7 dias) — lista compacta
- Top 5 formadores por horas no mês

### 3. Relatório mensal de horas por formador
Nova rota `/relatorios` com:
- Seletor mês/ano
- Tabela por formador: nome, abreviatura, horas no mês, n.º sessões, cursos envolvidos, UFCDs lecionadas
- Detalhe expandível: lista de sessões do mês (data, horas, curso, UFCD)
- Totais no rodapé
- **Exportação Excel** (.xlsx) com 2 folhas: Resumo + Detalhe
- **Impressão** com layout limpo (uma folha A4)

### 4. Link de navegação
Adicionar "Relatórios" no menu lateral.

## Detalhes técnicos

- Tabela `formando_faltas` já existe — só precisa de leitura/escrita; sem migração.
- Exportação Excel via `xlsx` (SheetJS) no cliente (browser), sem servidor.
- Queries Supabase com joins existentes (`sessoes` → `formador`, `curso`, `curso_ufcd`).
- Componentes shadcn reutilizados: Dialog, Table, Card, Tabs, Select.
- Sem alterações de schema (a não ser que detete algo em falta nas presenças).

## Ordem de implementação
1. Dialog de presenças + integração no cronograma do curso
2. Dashboard com KPIs
3. Página de relatórios + exportação Excel + impressão
4. Item de menu