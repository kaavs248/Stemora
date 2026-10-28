# STEMORA

STEMORA is a stem-cell bank management prototype with a web client, an API, a PostgreSQL data store, and Ethereum smart contracts. The API keeps operational records in PostgreSQL and uses the configured contracts to record supported sample lifecycle, consent, access-decision, and audit activity.

## Repository layout

- `frontend/` — React and TypeScript web app built with Vite.
- `backend/` — Express API, Prisma schema, and PostgreSQL adapter.
- `contracts/` — Solidity contracts: `AccessRoles`, `SampleRegistry`, `ConsentManager`, `AuditLogger`, and `AccessControl`.
- `scripts/deploy.ts` — deploys those contracts and writes their addresses to the local, git-ignored `deployment.json`.
- `hardhat.config.ts` — Solidity compiler and simulated, localhost, and Sepolia network settings.

The API mounts routes under `/api` for authentication, users, donors, researchers, samples, lifecycle history, consent, access requests and grants, documents, and audit records. Authentication uses JWTs and role checks.

## Prerequisites

Install Node.js/npm, PostgreSQL, and (for blockchain-backed local development) use the included Hardhat node. A separately installed Ethereum node is not required for the local demo.

## Local setup

### 1. Install the root blockchain dependencies

From the repository root:

```sh
npm install
npx hardhat compile
npx hardhat test
```

### 2. Start a local chain and deploy the contracts

In one terminal at the repository root, start the configured Hardhat development node:

```sh
npx hardhat node
```

In a second terminal at the repository root, deploy the contracts to it:

```sh
npx hardhat run scripts/deploy.ts --network localhost
```

The script prints each contract address and writes the result to `deployment.json` in the repository root. This generated file is git-ignored. If you redeploy, update the corresponding contract addresses in the backend environment file.

### 3. Configure and start the API

Create a PostgreSQL database and set its connection URL. From `backend/`, install dependencies and create a local environment file from the checked-in example:

```sh
npm install
cp .env.example .env
```

Edit `backend/.env` and set these values:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection URL for the database you created. The example URL uses a local database named `stemora`. |
| `JWT_SECRET` | A strong, locally generated secret for signing API tokens. |
| `BLOCKCHAIN_RPC_URL` | Local node URL; the example uses `http://127.0.0.1:8545`. |
| `BLOCKCHAIN_PRIVATE_KEY` | Private key for a local Hardhat development account. |
| `ACCESS_ROLES_ADDRESS` | Address of `AccessRoles` from `deployment.json`. |
| `SAMPLE_REGISTRY_ADDRESS` | Address of `SampleRegistry` from `deployment.json`. |
| `CONSENT_MANAGER_ADDRESS` | Address of `ConsentManager` from `deployment.json`. |
| `AUDIT_LOGGER_ADDRESS` | Address of `AuditLogger` from `deployment.json`. |
| `ACCESS_CONTROL_ADDRESS` | Address of `AccessControl` from `deployment.json`. |

The API requires the blockchain variables and addresses when its blockchain service loads. The optional `PORT` variable changes the API listen port; it defaults to `5000`.

Still in `backend/`, prepare Prisma and start the API:

```sh
npx prisma generate
npx prisma db push
npm run dev
```

The API root responds at `http://localhost:5000/` by default. Its routes are under `http://localhost:5000/api`.

### 4. Start the web app

In another terminal, from `frontend/`:

```sh
npm install
npm run dev
```

Vite prints the local web address when it starts. The client calls `http://localhost:5000/api` by default. Set `VITE_API_URL` in the frontend environment if the API uses a different base URL.

To check the frontend production build and lint source files, run these from `frontend/`:

```sh
npm run build
npm run lint
```

## Configuration and secrets

The backend variable names and local example values are in `backend/.env.example`; the optional Sepolia RPC URL and signer key names are in `hardhat.config.ts` as `SEPOLIA_RPC_URL` and `SEPOLIA_PRIVATE_KEY`.

Never commit `.env` files, database passwords, JWT secrets, wallet private keys, or other credentials. Use local development accounts only for the local chain. The checked-in `.env.example` is a template; replace its placeholders and confirm contract addresses match the network you are using.

## Useful commands

| Working directory | Command | Purpose |
| --- | --- | --- |
| Repository root | `npx hardhat compile` | Compile Solidity contracts. |
| Repository root | `npx hardhat test` | Run the Hardhat test suite. |
| Repository root | `npx hardhat node` | Start the local development chain. |
| `backend/` | `npm run dev` | Start the API with automatic restart during development. |
| `backend/` | `npm test` | Run the backend's configured tests. |
| `frontend/` | `npm run dev` | Start the Vite development server. |
| `frontend/` | `npm run build` | Type-check and build the frontend. |
| `frontend/` | `npm run lint` | Lint frontend source files. |

For Hardhat-specific project guidance, see [AGENTS.md](AGENTS.md).
