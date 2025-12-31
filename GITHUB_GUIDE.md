# 🐙 How to Push Jetlag to GitHub

Follow these steps to upload your code to a GitHub repository.

## 1. Create a Repository
1.  Go to [github.com/new](https://github.com/new).
2.  **Repository Name:** `jetlag-pwa` (or whatever you like).
3.  **Visibility:** Public or Private.
4.  **Do NOT** initialize with README, .gitignore, or License (we already have these).
5.  Click **Create repository**.

## 2. Open Terminal
Open your command prompt or terminal in the project folder:
`c:\Users\huzai\Documents\Jetlag`

## 3. Run Git Commands
Copy and run these block by block:

### A. Initialize Git (if not done)
```bash
git init
git branch -M main
```

### B. Add Your Files
This stages all your files for commit.
```bash
git add .
```

### C. Commit
Saves the snapshot of your project.
```bash
git commit -m "Initial commit of Jetlag PWA"
```

### D. Link to GitHub
Replace `<YOUR_URL>` with the URL from step 1 (e.g., `https://github.com/username/jetlag.git`).
```bash
git remote add origin <YOUR_URL>
```

### E. Push
Uploads your code.
```bash
git push -u origin main
```

---

## ✅ Success!
Your code is now on GitHub. You can now connect this repository to **Vercel** for automatic deployment (see `deploy_to_prod.md`).
