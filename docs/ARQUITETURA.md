# Arquitetura do Portal de Conferência de Entregas

## Antes de mais nada: o que é "/" ?

Quando você vê algo como `public/js/state.js`, cada `/` separa uma **pasta**.
Lendo da esquerda pra direita: dentro da pasta `public`, tem uma pasta `js`,
e dentro dela tem o arquivo `state.js`. É exatamente como quando você navega
pelo Explorador de Arquivos do Windows clicando pasta por pasta — só que
escrito em uma linha só. `public/js/state.js` = pasta `public` → pasta `js`
→ arquivo `state.js`.

## Estrutura final

```
portal-conferencia/
│
├── public/                        ← FRONTEND (tudo que roda na tela)
│   ├── index.html                  → só a estrutura HTML (login, sidebar, páginas, modais)
│   ├── css/
│   │   └── main.css                → todo o visual (cores, layout, botões, tabelas...)
│   └── js/
│       ├── firebase-keys.local.js  → SUAS chaves do Firebase (não vai pro GitHub)
│       ├── firebase-config.js      → conexão com o Firestore (salvar/carregar nuvem)
│       ├── state.js                → variáveis globais do app (rows, occTypes...)
│       ├── ui-dashboard.js         → conferência do dia: importar planilha, tabela, KPIs, gráficos
│       ├── occurrence-types.js     → cadastro dos tipos de ocorrência (código + descrição)
│       ├── autosave.js             → salvamento automático enquanto você trabalha
│       ├── ui-occurrences-report.js→ painel de análise de ocorrências (gráficos e tabela detalhada)
│       ├── ui-history.js           → histórico de conferências, pendentes de dias anteriores, exportar
│       ├── login.js                → tela de login e segurança de acesso
│       ├── ui-drivers.js           → cadastro de motoristas + modal "retornaram"
│       ├── ui-reports.js           → ranking, conclusão da operação, dashboard gerencial
│       ├── dark-mode.js            → modo escuro
│       └── ui-retidos-cargas.js    → CTEs retidos + cargas pendentes de entrega
│
├── electron/                      ← "BACKEND" DO APP DESKTOP (janela, sistema operacional)
│   ├── main.js                     → abre a janela do programa
│   └── preload.js                  → ponte segura entre o Electron e a tela
│
├── firebase/                      ← BANCO DE DADOS (regras de acesso, não é código do app)
│   ├── firestore.rules             → quem pode ler/escrever no banco
│   └── firestore.indexes.json
│
├── firebase.json                  → configuração do Firebase CLI
├── package.json                   → scripts do projeto (npm start etc.)
└── .gitignore                     → lista de arquivos que NUNCA vão pro GitHub (suas chaves, por ex.)
```

## Mapa completo: o que foi pra onde

Seu `index.html` original tinha ~5.250 linhas com tudo junto. Nada foi
reescrito — cada trecho só foi movido para o arquivo certo, na mesma ordem.

| Trecho original (comentário no seu código) | Foi para |
|---|---|
| Todo o `<style>...</style>` | `public/css/main.css` |
| Bloco "FIREBASE SETUP" (1º `<script>` do `<head>`) | `public/js/firebase-config.js` |
| STATE | `public/js/state.js` |
| INIT | `public/js/app-init.js` |
| PAGE NAVIGATION, FILE IMPORT, DASHBOARD, CHARTS, MÓDULO 07 (Viagem Adicional), MÓDULO 10 (Ordenação), INIT ADICIONAIS | `public/js/ui-dashboard.js` |
| OCCURRENCE TYPES | `public/js/occurrence-types.js` |
| AUTOSAVE | `public/js/autosave.js` |
| ANÁLISE DE OCORRÊNCIAS (modal), ABA OCORRÊNCIAS — PAINEL COMPLETO | `public/js/ui-occurrences-report.js` |
| PENDENTES DO DIA ANTERIOR, SAVE DAY, HISTORY, NEW DAY, EXPORT XLSX, MODALS/TOAST, MÓDULO 12 (Histórico Protegido) | `public/js/ui-history.js` |
| LOGIN | `public/js/login.js` |
| MOTORISTAS CADASTRADOS, MODAL RETORNARAM, MÓDULO 11 (Cadastro dedicado) | `public/js/ui-drivers.js` |
| MÓDULO 01 (Ranking), 02 (Conclusão), 03 (Pendentes), 04 (Exportação Excel), 06 (Dashboard Gerencial) | `public/js/ui-reports.js` |
| MÓDULO 08 (Dark Mode) | `public/js/dark-mode.js` |
| MÓDULO 13 (CTEs Retidos), 14 (Cargas Pendentes), 15 (Init Final) | `public/js/ui-retidos-cargas.js` |
| Todo o `<body>` (login, sidebar, páginas, modais) | `public/index.html` |

Testei a sintaxe de todos os arquivos JS juntos (na mesma ordem em que o
`index.html` os carrega) e não há nenhum erro — inclusive verifiquei que
nenhuma variável ficou declarada duas vezes em arquivos diferentes.

## Ordem de carregamento (por que importa)

No `public/index.html`, os scripts são carregados nesta ordem, no fim do `<body>`:

```html
<script src="js/firebase-keys.local.js"></script>
<script src="js/firebase-config.js"></script>
<script src="js/state.js"></script>
<script src="js/ui-dashboard.js"></script>
<script src="js/occurrence-types.js"></script>
<script src="js/autosave.js"></script>
<script src="js/ui-occurrences-report.js"></script>
<script src="js/ui-history.js"></script>
<script src="js/login.js"></script>
<script src="js/ui-drivers.js"></script>
<script src="js/ui-reports.js"></script>
<script src="js/dark-mode.js"></script>
<script src="js/ui-retidos-cargas.js"></script>
<script src="js/app-init.js"></script>
```

Isso importa porque, por exemplo, `state.js` declara a variável `rows` que
todos os outros arquivos usam — por isso ele vem primeiro. `app-init.js` vem
por último porque ele só "liga" o app (dispara funções como `updateDatePill()`
e `checkPendingYesterday()`), então precisa que tudo já esteja carregado antes.

## Suas chaves do Firebase

O arquivo `public/js/firebase-keys.local.js` já foi criado com valores de
exemplo (`"COLE_AQUI"`). Abra esse arquivo e substitua pelos valores reais do
seu projeto Firebase (Console do Firebase → ⚙️ Configurações do projeto →
Seus apps → SDK). Esse arquivo está no `.gitignore`, ou seja, **nunca** vai
subir pro GitHub — cada pessoa que clonar o projeto cria o dela a partir de
`firebase-keys.local.example.js`.

## Rodando o projeto

```bash
npm install
npm start        # abre o app no Electron
```

Se preferir só abrir no navegador pra testar rapidamente (sem Electron),
pode abrir `public/index.html` direto — mas funções específicas do Electron
que você adicionar futuramente não vão funcionar fora do app desktop.

## Publicando (opcional)

```bash
npm install -g firebase-tools
firebase login
firebase init          # Firestore + Hosting, pasta pública = public
firebase deploy
```
