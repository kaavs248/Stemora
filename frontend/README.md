# STEMORA web app

This directory contains the STEMORA React and TypeScript client, built with Vite. It provides authentication and role-aware workspace views and calls the backend API.

## Setup

From this directory:

```sh
npm install
npm run dev
```

Vite prints the local web address. The API client defaults to `http://localhost:5000/api`; set `VITE_API_URL` if your API is hosted elsewhere.

## Checks

```sh
npm run build
npm run lint
```

See the [root README](../README.md) for full local setup, including PostgreSQL and the blockchain node.
