# Correções — Regime de faltas EFA e Módulo financeiro

Fase 1 (esta): análise e plano. Nenhum código, dado ou processamento foi alterado.

## 1. Diagnóstico do que existe hoje

| Área | Comportamento atual | Problema |
|---|---|---|
| Faltas (painel) | Alerta quando faltas por UFCD ≥ 8% (amarelo) / ≥ 10% (vermelho), calculado no próprio painel | Não há controlo de 90% global nem de 50% por UFCD; o cálculo está repetido em vários ecrãs |
| Faltas justificadas na bolsa | Não descontam horas — são pagas a 100%, sem limite | Não existe o limite acumulado de 10% do percurso (art. 25.º Portaria 325/2023) |
| Faltas injustificadas | Descontam horas da bolsa | Correto |
| Online | Não é falta; conta para SA; retira TR nesse dia | Manter; confirmar regra do TR |
| Fórmula BF/BFM | `min(valor_mensal / 150 × horas, valor_mensal)` igual para BF e BFM | Diferente da fórmula `Nhf × Vb × 12 / (52 × 30)`; não distingue BF de BFM |
| SA | Dias com ≥ 3h efetivas × valor diário | Limiar de 3h fixo no código, não configurável |
| TR | Km (com limite km/dia) ou passe; teto mensal | Limite/teto = 0 é lido como "sem limite" em silêncio |
| Honorários | Todas as sessões do mês × valor/hora | As sessões não têm estado (realizada/cancelada) — paga tudo o que está no cronograma |
| Processamento fechado | Guardado com memória de cálculo | Sem fluxo explícito de retificação justificada |

## 2. Alterações propostas

### A. Função central de assiduidade (novo módulo partilhado)
Um único cálculo por formando: horas previstas do percurso, frequentadas, faltas justificadas, injustificadas, assiduidade global e por UFCD, e estado de cada requisito (90% global / 50% UFCD). Usado no painel, ficha do curso, ficha do formando, relatórios e motor financeiro. Inclui validações: sessões duplicadas, faltas maiores que as horas da sessão, registos incompletos.
Os alertas 8%/10% mantêm-se, renomeados "Alerta interno (preventivo)".

### B. Recuperação pedagógica (novo)
Na ficha do formando, quando um requisito falha: sinalização "Para análise da coordenação", registo de justificação e decisão fundamentada, plano de recuperação (objetivos, atividades, responsável, prazo, evidências), avaliação e decisão final. Nada é bloqueado nem excluído automaticamente.
Requer uma tabela nova (aditiva, sem tocar nas existentes).

### C. Bolsas BF/BFM
- Saldo acumulado de faltas justificadas pagáveis = 10% das horas totais do percurso, consumido mês a mês por ordem cronológica, sem reiniciar. O que exceder deixa de ser pago.
- Fórmula escolhida por tipo de bolsa (ver perguntas). A memória de cálculo mostra o saldo usado e restante.
- Processamentos já guardados não são recalculados.

### D. SA e TR
- Limiar de horas do SA passa a configuração (valor por defeito 3h, mantém comportamento atual).
- Limites/teto de TR passam a ter opção explícita "Sem limite" vs valor; zero deixa de significar "sem limite" em silêncio (dados atuais migrados para "sem limite" para não mudar valores).

### E. Honorários
Coluna nova "estado" nas sessões (por defeito "realizada" — sessões existentes não mudam). Sessões "cancelada"/"não realizada" deixam de contar para honorários, bolsas e SA. Ajustes manuais registados na auditoria.

### F. Consistência e retificações
Excel, PDF, histórico e ficha do formando passam a ler a memória de cálculo guardada (sem fórmulas próprias). Reabrir um processamento fechado exige motivo e fica registado.

### G. Testes
Testes automáticos ao motor e à função de assiduidade com os 15 cenários pedidos, com valores esperados vs obtidos apresentados no final.

## 3. Migrações previstas (todas aditivas, sem apagar nada)
- `sessoes.estado` (default "realizada").
- Tabela de recuperação pedagógica.
- Campos de configuração: limiar SA, limite financeiro de faltas justificadas (default 10%), modo explícito dos tetos de TR.

## 4. Dependências que precisam da sua confirmação antes de fixar no código
1. Fórmula da BF e da BFM: qual se aplica a cada uma na vossa operação?
2. Limite de faltas justificadas pagáveis: 10% ou outro valor fixado pela Autoridade de Gestão?
3. Limiar de 3h para SA: está no regulamento/operação? Manter?
4. TR em dias online: manter "não pago"?
5. Participação online conta como presença para os 90%/50%?

## Detalhes técnicos
Ficheiros afetados: `src/lib/financeiro/engine.ts`, novo `src/lib/assiduidade.ts`, `dashboard.tsx`, `cursos.$id.tsx`, `formandos.$id.tsx`, `relatorios.tsx`, `financeiro.processamentos.$id.tsx`, `financeiro.configuracao.tsx`, `src/lib/financeiro/excel*.ts`, `src/lib/pdf-exports.ts`, cronograma (seleção do estado da sessão). Testes em vitest.
