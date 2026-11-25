# Fanni — Home Services Marketplace

**Live:** https://fanni-marketplace.vercel.app

A full-stack marketplace that connects clients with home-service technicians for any trade
(plumbing, electrical, painting, carpentry, AC, cleaning and more). Clients search, book and
review; technicians register, receive requests and manage jobs from their own dashboard.

## Stack

- **Frontend:** React 18, Redux Toolkit (state management), React Router, Axios
  (with request/response interceptors), Vite
- **Backend:** Node.js, Express, layered structure (`core` / `middleware` / `routes` / `utils`)
- **Security:** bcrypt password hashing, JWT auth, role-based access control, rate limiting
- **Deploy:** Vercel (static client + serverless Express API)

## Features

- Role-based registration (client / technician) and login
- Browse professions, search and filter technicians by trade, city and rating
- Location-based matching: clients can sort by nearest (browser geolocation),
  with rating as the tie-breaker; distances shown per technician
- Booking flow with a status lifecycle: `pending → accepted → completed`, plus `declined` / `cancelled`
- Client dashboard: track bookings, cancel, review completed jobs
- Technician dashboard: accept/decline requests, complete jobs, edit profile
- Reviews feed back into the technician's public rating

## Project structure

```
├── api/index.js          # Vercel serverless entry (wraps the Express app)
├── server/
│   ├── app.js            # Express app assembly
│   ├── server.js         # local dev listener
│   ├── core/             # config, in-memory store + seed, ApiError, logger
│   ├── middleware/       # auth (JWT), role guard, error handler, rate limiter
│   ├── routes/           # auth / professions / technicians / bookings
│   └── utils/            # crypto (bcrypt + JWT), validators
├── client/               # React + Redux app (Vite)
│   └── src/
│       ├── api/          # axios instance + interceptors
│       ├── app/          # Redux store
│       ├── features/     # auth / technicians / bookings slices
│       ├── components/   # Navbar, TechnicianCard, Stars, ProtectedRoute
│       └── pages/        # Home, Technicians, Details, Login, Register, dashboards
└── tests/                # end-to-end smoke test (node --test)
```

## Run locally

```bash
npm install
npm --prefix client install
npm --prefix client run build   # build the client once
npm run dev                     # serves API + client on http://localhost:3001
```

Or run the two sides separately: `npm run dev` (API on :3001) and
`npm --prefix client run dev` (Vite on :5173 with a proxy to the API).

## Tests

```bash
npm test
```

Runs an end-to-end smoke test through the real API: register → login → browse →
book → accept → complete → review, including role-guard and auth failures.

## API overview

| Method | Route | Auth | Description |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | – | register client or technician |
| POST | `/api/auth/login` | – | log in, returns JWT |
| GET | `/api/auth/me` | bearer | current session user |
| GET | `/api/professions` | – | professions with technician counts |
| GET | `/api/technicians` | – | search/filter technicians (`lat`+`lng` → distance-ranked) |
| GET | `/api/technicians/:id` | – | public technician profile |
| PATCH | `/api/technicians/me` | technician | update own profile |
| POST | `/api/bookings` | client | create a booking |
| GET | `/api/bookings/mine` | client | own bookings |
| GET | `/api/bookings/incoming` | technician | incoming requests |
| PATCH | `/api/bookings/:id/status` | both | status lifecycle transitions |
| POST | `/api/bookings/:id/review` | client | review a completed job |

## Demo accounts

- Client: `client@demo.com` / `Demo@1234`
- Technician: `tech@demo.com` / `Demo@1234`

## Notes

- Data lives in an in-memory store seeded with demo technicians (see
  `server/core/store.js`); on serverless it resets on cold starts. Swap the
  store module for MongoDB/Postgres without touching the routes.
- Set `JWT_SECRET` in the environment for production.
