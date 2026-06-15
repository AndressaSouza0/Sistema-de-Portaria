# Sistema de Portaria do Galpão

Aplicação web para controle de acesso e operações de um galpão: entrada e
saída de caminhões, entregas/coletas esperadas, ocorrências, bate-ponto de
funcionários e relatórios. Construída em HTML/CSS/JavaScript puro (módulos
ES) com [Supabase](https://supabase.com) como backend (autenticação, banco
de dados Postgres e armazenamento de arquivos).

## Páginas

| Arquivo | Descrição |
| --- | --- |
| `login.html` | Login e criação de conta |
| `index.html` | Dashboard com indicadores, pátio atual e gráficos |
| `movimentacao.html` | Registro de entrada e saída de caminhões |
| `entregas.html` | Cadastro e acompanhamento de entregas/coletas esperadas |
| `ocorrencias.html` | Registro e resolução de ocorrências (avarias, atrasos, etc.) |
| `ponto.html` | Bate-ponto de funcionários |
| `relatorios.html` | Relatórios e exportação de dados |
| `cadastros.html` | Cadastro de funcionários, transportadoras e usuários (admin) |

## Estrutura do projeto

```
css/style.css        Estilos compartilhados por todas as páginas
js/config.js          Configuração do Supabase (URL e chave anônima)
js/supabaseClient.js   Instância do cliente Supabase
js/auth.js             Autenticação, sessão e verificação de perfil
js/layout.js           Renderização do menu lateral e topo
js/utils.js            Funções utilitárias (datas, badges, CSV, upload de fotos, etc.)
js/*.js                 Lógica de cada página
sql/schema.sql          Script de criação do banco de dados no Supabase
vercel.json              Configuração de deploy (Vercel)
```

## Configuração

1. Crie um projeto em [supabase.com](https://supabase.com).
2. Em **Project Settings > API**, copie a *Project URL* e a *anon public
   key* e preencha `js/config.js`:

   ```js
   export const SUPABASE_URL = 'https://SEU-PROJETO.supabase.co';
   export const SUPABASE_ANON_KEY = 'SUA_CHAVE_ANON';
   ```

3. Abra o **SQL Editor** do Supabase, cole o conteúdo de `sql/schema.sql` e
   execute. Isso cria as tabelas (`profiles`, `transportadoras`,
   `funcionarios`, `entregas`, `visitas`, `ocorrencias`, `ponto_registros`),
   as políticas de RLS e o bucket de Storage `ocorrencias` para fotos.
4. Em **Authentication > Providers**, confirme que o provedor *Email* está
   habilitado.
5. Acesse `login.html` e crie sua conta pela aba "Criar conta". Por padrão,
   todo novo usuário recebe o cargo `porteiro`.
6. Para liberar o acesso completo (página de Cadastros), promova esse
   usuário a administrador rodando no SQL Editor:

   ```sql
   update public.profiles set cargo = 'admin' where email = 'SEU_EMAIL';
   ```

## Deploy

O projeto é estático e pode ser publicado em qualquer hospedagem de
arquivos estáticos. O arquivo `vercel.json` já configura URLs limpas
(`cleanUrls`) para deploy direto na [Vercel](https://vercel.com).
