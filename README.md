# Portal de Conferência de Entregas

Desenvolvido por **Mindset7 Studio**.

Veja a explicação completa da arquitetura e como migrar seu `index.html`
atual em [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

---

## 1. Conectar este projeto ao GitHub (pelo VS Code)

1. Abra esta pasta no VS Code (`Arquivo > Abrir Pasta...`)
2. No terminal integrado do VS Code (`Ctrl + \``), rode:
   ```bash
   git init
   git add .
   git commit -m "chore: estrutura inicial do projeto organizada"
   ```
3. Crie um repositório vazio no GitHub (sem README, sem .gitignore — você já tem)
   - Pode ser **privado** (recomendado, já que tem lógica de negócio de cliente)
4. Ainda no terminal:
   ```bash
   git branch -M main
   git remote add origin https://github.com/SEU_USUARIO/NOME_DO_REPO.git
   git push -u origin main
   ```
5. Alternativa 100% visual: clique no ícone do **Source Control** (barra
   lateral esquerda, ícone de "galho"), clique em "Publish to GitHub" —
   o VS Code faz os passos acima sozinho se você estiver logado com a
   extensão GitHub (ícone de nuvem no canto inferior esquerdo pra logar).

## 2. Conectar ao Firebase (Firestore) pelo terminal do VS Code

1. Instale o Firebase CLI (uma vez só, global):
   ```bash
   npm install -g firebase-tools
   ```
2. Faça login (abre o navegador):
   ```bash
   firebase login
   ```
3. Dentro da pasta do projeto:
   ```bash
   firebase init
   ```
   - Marque **Firestore** e **Hosting** (setas + espaço pra marcar, enter pra confirmar)
   - Escolha "Use an existing project" → selecione `portal-conferencia`
     (o mesmo projeto que você já usa)
   - Quando perguntar o arquivo de regras: aponte para `firebase/firestore.rules`
   - Quando perguntar a pasta pública (hosting): digite `public`
   - "Configure as single-page app": responda **No** (não é SPA com rotas)
4. Isso vai gerar um `.firebaserc` (não sobe pro Git, já está no `.gitignore`)
5. Pra publicar as regras de segurança do Firestore:
   ```bash
   firebase deploy --only firestore:rules
   ```
6. Pra publicar a versão web (se quiser acessar o portal também pelo navegador,
   não só pelo Electron):
   ```bash
   firebase deploy --only hosting
   ```

## 3. Rodando o app

```bash
npm install
npm start
```

## 4. Suas chaves do Firebase

Copie `public/js/firebase-keys.local.example.js` para
`public/js/firebase-keys.local.js` e preencha com as chaves reais
(Console do Firebase → ⚙️ Configurações do projeto → Seus apps → SDK).
Esse arquivo **nunca** vai pro GitHub (já está no `.gitignore`).
