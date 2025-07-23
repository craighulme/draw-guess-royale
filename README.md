# 🎨 Draw & Guess Royale

A fast-paced, multiplayer drawing & guessing tournament built for the **Convex & Resend Hackathon**! 

## Features

### 🚀 **Core Gameplay**
- **Real-time drawing canvas** with live stroke synchronization
- **Multiplayer rooms** with up to 6 players
- **Turn-based rounds** where players take turns drawing and guessing
- **Instant scoring system** with time-based bonuses
- **Live leaderboards** updated in real-time

### 📧 **Email Engagement (Resend Integration)**
- **Game invites** sent automatically to friends
- **Round result emails** with sketches and scores
- **Champion announcements** with final leaderboards
- **Player join notifications** for hosts
- **Daily digest emails** with top artists

### ⚡ **Real-time Features (Convex Integration)**
- **Live drawing sync** - see strokes appear in real-time
- **Instant guess validation** and scoring
- **Real-time chat** and leaderboard updates
- **Automatic round progression** with timeouts
- **File storage** for sketch preservation

## Tech Stack

- **Frontend**: Next.js 15, React, TypeScript, Tailwind CSS
- **Backend**: Convex (real-time database & functions)
- **Email**: Resend with beautiful HTML templates
- **Deployment**: Vercel (optimized for Next.js)

## Quick Start

### 1. **Clone & Install**
```bash
git clone <your-repo-url>
cd draw-guess-royale
npm install
```

### 2. **Set up Environment Variables**
Copy `.env.local.example` to `.env.local` and fill in:

```bash
# Get your Convex URL from https://dashboard.convex.dev (This will be automatic if you use convex dev bash)
NEXT_PUBLIC_CONVEX_URL=https://your-convex-url.convex.cloud
CONVEX_DEPLOY_KEY=your-convex-deploy-key

# Get your Resend API key from https://resend.com/api-keys
RESEND_API_KEY=re_your-resend-api-key

# Your app URL (for email links)
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. **Initialize Convex**
```bash
# Setup Convex (or create account)
npx convex dev
```

### 4. **Run Development Server**
```bash
npm run dev
```

Visit `http://localhost:3000` and start your first drawing battle! 🎨

## How to Play

### **Creating a Room**
1. Click "Create a Battle" 
2. Enter a room name and your artist name
3. Share the generated room code with friends
4. Start the game when everyone joins!

### **Joining a Room**  
1. Click "Join a Battle"
2. Enter the room code and your name
3. Optionally add your email for result notifications
4. Wait for the host to start the game

### **During the Game**
- **Artists**: Draw the secret word using the canvas tools
- **Guessers**: Type your guesses in real-time
- **Scoring**: Faster correct guesses = more points!
- **Rounds**: Take turns being the artist

## Email Features

The game sends beautiful emails for:

- **🎨 Game Invites**: Invite friends with one-click join links
- **🎯 Round Results**: See the word, sketch, and who guessed correctly  
- **🏆 Game Complete**: Final leaderboard with social share buttons
- **📊 Daily Digest**: Top artists and game statistics
- **🎉 Join Notifications**: Alert hosts when players join

## Hackathon Highlights

### **Convex Usage**
- **Real-time subscriptions** for live drawing sync
- **File storage** for sketch preservation  
- **Background functions** for round timeouts
- **Scheduled functions** for daily digests
- **Complex queries** with indexes for performance

### **Resend Usage**
- **Transactional emails** triggered by game events
- **Scheduled emails** for digests and reminders
- **HTML templates** with embedded images
- **Bulk sending** to all players in a room

## Deployment

### **Deploy to Vercel**
```bash
# Build and deploy
npm run build
vercel --prod
```

### **Set Environment Variables in Vercel**
Add the same environment variables from `.env.local` to your Vercel project settings.

## Architecture

```
├── src/
│   ├── app/                  # Next.js 15 app router
│   │   ├── page.tsx         # Homepage
│   │   ├── room/[id]/       # Game room pages
│   │   └── join/[code]/     # Invite join pages
│   └── components/
│       ├── DrawingCanvas.tsx # Real-time drawing
│       ├── GameRoom.tsx     # Main game interface
│       └── HomePage.tsx     # Landing page
├── convex/
│   ├── schema.ts           # Database schema
│   ├── rooms.ts            # Room management
│   ├── game.ts             # Game logic  
│   ├── resend.ts           # Email functions
│   └── triggers.ts         # Background jobs
└── public/                 # Static assets
```

## Contributing

Built for the **Convex & Resend Hackathon** - July 16 - August 4, 2024

**Requirements met:**
- ✅ Uses Resend Convex Component
- ✅ Full-stack application
- ✅ Creative use of both platforms
- ✅ Social sharing features
- ✅ Real-time interactions

---


Ready, set, sketch! 🖌️
