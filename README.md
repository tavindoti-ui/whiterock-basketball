# 🏀 White Rock Basketball — Sistema de Gestão

Sistema completo de gestão para o time White Rock Basketball.

## Tecnologias
- **Frontend**: HTML + CSS + JS puro (sem framework)
- **Backend**: Node.js serverless (Vercel Functions)
- **Banco de dados**: Vercel KV (Redis gerenciado)
- **Auth**: JWT + bcrypt

## Estrutura do projeto
```
whiterock/
├── api/
│   ├── login.js        # POST /api/login
│   ├── users.js        # CRUD usuários (admin)
│   ├── jogadores.js    # CRUD jogadores
│   ├── jogos.js        # CRUD jogos + estatísticas
│   ├── treinos.js      # CRUD treinos + presença
│   ├── financeiro.js   # Lançamentos + mensalidades
│   └── avisos.js       # Mural de avisos
├── lib/
│   ├── auth.js         # JWT helpers
│   ├── db.js           # Vercel KV + seed inicial
│   └── cors.js         # CORS headers
├── public/
│   └── index.html      # Frontend completo
├── vercel.json         # Configuração Vercel
└── package.json
```

## Níveis de acesso

| Funcionalidade        | Admin | Capitão | Atleta |
|-----------------------|:-----:|:-------:|:------:|
| Ver dashboard         | ✅    | ✅      | ✅     |
| Ver jogadores         | ✅    | ✅      | ✅     |
| Cadastrar jogadores   | ✅    | ✅      | ❌     |
| Ver jogos             | ✅    | ✅      | ✅     |
| Cadastrar jogos       | ✅    | ✅      | ❌     |
| Registrar estatísticas| ✅    | ✅      | ❌     |
| Ver treinos           | ✅    | ✅      | ✅     |
| Agendar treinos       | ✅    | ✅      | ❌     |
| Ver financeiro        | ✅    | ✅      | ❌     |
| Lançar financeiro     | ✅    | ❌      | ❌     |
| Ver avisos            | ✅    | ✅      | ✅     |
| Publicar avisos       | ✅    | ✅      | ❌     |
| Gerenciar usuários    | ✅    | ❌      | ❌     |

## Credenciais iniciais
| Usuário | Email | Senha |
|---------|-------|-------|
| Admin | admin@whiterock.com | admin123 |
| Capitão (Lucas) | lucas@whiterock.com | lucas123 |
| Atleta (Rafael) | rafael@whiterock.com | rafael123 |

⚠️ **Troque as senhas após o primeiro login!**

---

## 📋 Passo a passo — Deploy no Vercel

### 1. Criar conta no GitHub (se não tiver)
Acesse https://github.com e crie sua conta.

### 2. Criar repositório no GitHub
1. Clique em **New repository**
2. Nome: `whiterock-basketball`
3. Deixe **Public** ou **Private** (tanto faz)
4. Clique em **Create repository**

### 3. Fazer upload dos arquivos
Na página do repositório criado, clique em **uploading an existing file** e envie:
- A pasta `api/` com todos os arquivos .js
- A pasta `lib/` com todos os arquivos .js
- A pasta `public/` com o `index.html`
- O arquivo `vercel.json`
- O arquivo `package.json`

Ou via terminal (se tiver Git instalado):
```bash
git init
git add .
git commit -m "White Rock Basketball System"
git remote add origin https://github.com/SEU_USUARIO/whiterock-basketball.git
git push -u origin main
```

### 4. Criar conta no Vercel
Acesse https://vercel.com e clique em **Sign up with GitHub**.

### 5. Importar projeto
1. No dashboard Vercel, clique em **Add New Project**
2. Selecione o repositório `whiterock-basketball`
3. Clique em **Import**
4. Clique em **Deploy** (sem alterar nada)

### 6. Configurar Vercel KV (banco de dados)
1. No dashboard do seu projeto Vercel, clique em **Storage**
2. Clique em **Create Database** → **KV**
3. Nome: `whiterock-kv`
4. Clique em **Create**
5. Vá em **Settings** do KV → **Environments** → conecte ao seu projeto
6. As variáveis de ambiente são adicionadas automaticamente

### 7. Configurar variável JWT_SECRET
1. No projeto Vercel, vá em **Settings** → **Environment Variables**
2. Adicione:
   - Name: `JWT_SECRET`
   - Value: uma senha secreta longa (ex: `whiterock-super-secret-2026-xk9p`)
3. Clique em **Save**
4. Vá em **Deployments** e clique em **Redeploy**

### 8. Acessar o sistema
Seu sistema estará em: `https://whiterock-basketball.vercel.app`

Compartilhe o link com seus atletas! Eles fazem login com o email e senha que você cadastrou.

---

## Criar atletas no sistema
1. Faça login como **admin**
2. Vá em **Usuários** → **Criar usuário**
3. Informe nome, email, senha e função (atleta/capitão)
4. Envie o email e senha para cada atleta pelo WhatsApp

## Variáveis de ambiente necessárias
- `JWT_SECRET` — chave secreta para tokens (você define)
- `KV_REST_API_URL` — adicionada automaticamente pelo Vercel KV
- `KV_REST_API_TOKEN` — adicionada automaticamente pelo Vercel KV
