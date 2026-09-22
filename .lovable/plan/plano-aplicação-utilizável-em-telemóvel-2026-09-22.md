# Plano — Aplicação utilizável em telemóvel

## Objetivo
Adaptar apenas a apresentação abaixo de 768 px, sem alterar a versão de computador, dados ou funcionalidades.

## Alterações
1. **Navegação móvel**
   - Manter a barra lateral atual no computador.
   - No telemóvel, substituí-la por uma barra superior fixa com botão de menu.
   - Abrir a navegação e o seletor de projeto num painel lateral, com fecho automático após escolher uma página.

2. **Conteúdo e ações**
   - Reduzir margens laterais no telemóvel e impedir que a página ultrapasse a largura do ecrã.
   - Empilhar título, descrição e ações quando não couberem; botões permanecem acessíveis.
   - Transformar grelhas de formulários de duas colunas numa coluna apenas no telemóvel.

3. **Janelas, tabelas e cronograma**
   - Fazer as janelas ocuparem a largura útil e altura disponível, com deslocação vertical interna.
   - Permitir deslocação horizontal dentro de tabelas e áreas naturalmente largas, sem alargar a página inteira.
   - Manter o cronograma funcional através de uma área horizontal deslocável, sem reduzir ou alterar o calendário de computador.

4. **Validação**
   - Testar navegação, páginas principais e abertura de janelas num telemóvel de 390 px.
   - Confirmar também a versão de computador para garantir que o aspeto atual ficou inalterado.

## Detalhes técnicos
- Alterações responsivas serão limitadas a classes base e variantes `md:`/`sm:`.
- A navegação reutilizará os mesmos destinos, ícones e ações existentes.
- Não haverá alterações na base de dados, regras de negócio ou comportamento funcional.
