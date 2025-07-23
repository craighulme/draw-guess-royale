# Deploy to Vercel

## Quick Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Development (runs both Convex and Next.js together):**
   ```bash
   npm run dev
   ```

3. **Deploy to Vercel:**
   - Push to GitHub
   - Connect repo to Vercel
   - Add environment variables in Vercel dashboard:
     - `CONVEX_DEPLOYMENT` - Your Convex deployment URL
     - `NEXT_PUBLIC_CONVEX_URL` - Your Convex public URL
     - `RESEND_API_KEY` - Your Resend API key
     - `NEXT_PUBLIC_APP_URL` - Your deployed app URL

## Environment Variables Needed

Create `.env.local` for development:
```
CONVEX_DEPLOYMENT=your-convex-deployment-name
NEXT_PUBLIC_CONVEX_URL=https://your-convex-url.convex.cloud
RESEND_API_KEY=your-resend-api-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Scripts Available

- `npm run dev` - Run both Convex and Next.js together
- `npm run dev:next` - Run only Next.js
- `npm run dev:convex` - Run only Convex
- `npm run build` - Build for production (deploys Convex first)
- `npm run deploy` - Deploy Convex only