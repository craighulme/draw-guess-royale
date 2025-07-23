import { v } from "convex/values";
import { mutation, query, internalQuery, internalAction } from "./_generated/server";
import { calculateGuessPoints, getRandomWord, generateInviteCode } from "./utils";
import { internal } from "./_generated/api";

export const submitStroke = mutation({
  args: {
    roomId: v.id("rooms"),
    strokeData: v.array(v.object({
      x: v.number(),
      y: v.number(),
      pressure: v.optional(v.number()),
      timestamp: v.number(),
    })),
    color: v.string(),
    width: v.number(),
    userId: v.string(),
    isLive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room || room.status !== "playing" || room.currentArtist !== args.userId) {
      throw new Error("Not authorized to draw");
    }

    if (Date.now() > (room.roundEndTime ?? 0)) {
      throw new Error("Round has ended");
    }

    // For live updates, append to existing live stroke for efficiency
    if (args.isLive) {
      // Find existing live stroke
      const existingLiveStroke = await ctx.db
        .query("strokes")
        .withIndex("by_room_round", (q) => 
          q.eq("roomId", args.roomId).eq("round", room.currentRound)
        )
        .filter((q) => q.eq(q.field("artistId"), args.userId))
        .filter((q) => q.eq(q.field("isLive"), true))
        .first();

      if (existingLiveStroke) {
        // Append new points to existing stroke (incremental update)
        const updatedStrokeData = [...existingLiveStroke.strokeData, ...args.strokeData];
        await ctx.db.patch(existingLiveStroke._id, {
          strokeData: updatedStrokeData,
          timestamp: Date.now(),
        });
      } else {
        // Create new live stroke
        await ctx.db.insert("strokes", {
          roomId: args.roomId,
          round: room.currentRound,
          artistId: args.userId,
          strokeData: args.strokeData,
          color: args.color,
          width: args.width,
          timestamp: Date.now(),
          isLive: true,
        });
      }
    } else {
      // Remove any live stroke and insert completed stroke
      const liveStrokes = await ctx.db
        .query("strokes")
        .withIndex("by_room_round", (q) => 
          q.eq("roomId", args.roomId).eq("round", room.currentRound)
        )
        .filter((q) => q.eq(q.field("artistId"), args.userId))
        .filter((q) => q.eq(q.field("isLive"), true))
        .collect();

      for (const stroke of liveStrokes) {
        await ctx.db.delete(stroke._id);
      }

      await ctx.db.insert("strokes", {
        roomId: args.roomId,
        round: room.currentRound,
        artistId: args.userId,
        strokeData: args.strokeData,
        color: args.color,
        width: args.width,
        timestamp: Date.now(),
        isLive: false,
      });
    }
  },
});

export const undoLastStroke = mutation({
  args: {
    roomId: v.id("rooms"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room || room.status !== "playing" || room.currentArtist !== args.userId) {
      throw new Error("Not authorized to undo");
    }

    // Find the most recent completed stroke by this artist
    const lastStroke = await ctx.db
      .query("strokes")
      .withIndex("by_room_round", (q) => 
        q.eq("roomId", args.roomId).eq("round", room.currentRound)
      )
      .filter((q) => q.eq(q.field("artistId"), args.userId))
      .filter((q) => q.eq(q.field("isLive"), false))
      .order("desc")
      .first();

    if (lastStroke) {
      await ctx.db.delete(lastStroke._id);
    }
  },
});

export const clearCanvas = mutation({
  args: {
    roomId: v.id("rooms"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room || room.status !== "playing" || room.currentArtist !== args.userId) {
      throw new Error("Not authorized to clear canvas");
    }

    // Delete all strokes for current round by this artist
    const strokes = await ctx.db
      .query("strokes")
      .withIndex("by_room_round", (q) => 
        q.eq("roomId", args.roomId).eq("round", room.currentRound)
      )
      .filter((q) => q.eq(q.field("artistId"), args.userId))
      .collect();

    for (const stroke of strokes) {
      await ctx.db.delete(stroke._id);
    }
  },
});

export const submitGuess = mutation({
  args: {
    roomId: v.id("rooms"),
    guess: v.string(),
    userId: v.string(),
    playerName: v.string(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room || room.status !== "playing" || room.currentArtist === args.userId) {
      throw new Error("Cannot guess while drawing or game not active");
    }

    if (Date.now() > (room.roundEndTime ?? 0)) {
      throw new Error("Round has ended");
    }

    const isCorrect = args.guess.toLowerCase().trim() === room.currentWord?.toLowerCase().trim();
    
    let points = 0;
    if (isCorrect) {
      const timeToGuess = Date.now() - (room.roundStartTime ?? Date.now());
      const roundDuration = (room.roundEndTime ?? Date.now()) - (room.roundStartTime ?? Date.now());
      
      // Check if this is the first correct guess
      const existingCorrectGuess = await ctx.db
        .query("guesses")
        .withIndex("by_room_round", (q) => 
          q.eq("roomId", args.roomId).eq("round", room.currentRound)
        )
        .filter((q) => q.eq(q.field("isCorrect"), true))
        .first();
      
      points = calculateGuessPoints(timeToGuess, roundDuration, !existingCorrectGuess);
      
      // Update player score
      const player = await ctx.db
        .query("players")
        .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
        .filter((q) => q.eq(q.field("userId"), args.userId))
        .first();
      
      if (player) {
        await ctx.db.patch(player._id, {
          score: player.score + points,
        });
      }
    }

    await ctx.db.insert("guesses", {
      roomId: args.roomId,
      round: room.currentRound,
      playerId: args.userId,
      playerName: args.playerName,
      guess: args.guess,
      isCorrect,
      timestamp: Date.now(),
      points,
    });

    // Auto-advance to next round if someone guessed correctly
    if (isCorrect) {
      // Clean up any live strokes before advancing/finishing - convert them to completed strokes
      const liveStrokes = await ctx.db
        .query("strokes")
        .withIndex("by_room_round", (q) => 
          q.eq("roomId", args.roomId).eq("round", room.currentRound)
        )
        .filter((q) => q.eq(q.field("isLive"), true))
        .collect();

      for (const liveStroke of liveStrokes) {
        // Convert live stroke to completed stroke
        await ctx.db.patch(liveStroke._id, {
          isLive: false,
        });
      }

      // Get all players for next artist selection
      const players = await ctx.db
        .query("players")
        .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
        .collect();

      if (room.currentRound >= room.maxRounds) {
        // Game finished - send end game emails and wait for host decision
        await ctx.db.patch(args.roomId, {
          status: "finished",
        });

        // Send game complete emails
        const playerEmails = players
          .filter(p => p.email)
          .map(p => p.email!);

        const leaderboard = players.sort((a, b) => b.score - a.score);
        
        if (playerEmails.length > 0 && leaderboard.length > 0) {
          await ctx.scheduler.runAfter(1000, internal.resend.sendGameComplete, {
            playerEmails,
            roomName: room.name,
            winner: { name: leaderboard[0].name, score: leaderboard[0].score },
            finalLeaderboard: leaderboard.map(p => ({ name: p.name, score: p.score })),
            totalRounds: room.maxRounds,
            roomId: args.roomId,
          });
        }

        return { isCorrect, points, gameFinished: true };
      }

      // Get next artist (cycle through players)
      const currentArtistIndex = players.findIndex(p => p.userId === room.currentArtist);
      const nextArtistIndex = (currentArtistIndex + 1) % players.length;
      const nextArtist = players[nextArtistIndex];

      const newWord = await getRandomWord(ctx);

      // Advance to next round automatically
      await ctx.db.patch(args.roomId, {
        currentRound: room.currentRound + 1,
        currentArtist: nextArtist.userId,
        currentWord: newWord,
        roundStartTime: Date.now(),
        roundEndTime: Date.now() + 120000, // 2 minutes
      });

      return { 
        isCorrect, 
        points, 
        gameFinished: false,
        roundAdvanced: true,
        newRound: room.currentRound + 1,
        newArtist: nextArtist.userId,
      };
    }

    return { isCorrect, points };
  },
});

export const getStrokes = query({
  args: { 
    roomId: v.id("rooms"),
    round: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room) return [];

    const round = args.round ?? room.currentRound;

    return await ctx.db
      .query("strokes")
      .withIndex("by_room_round", (q) => 
        q.eq("roomId", args.roomId).eq("round", round)
      )
      .order("asc")
      .collect();
  },
});

export const getAllStrokesForRoom = query({
  args: { 
    roomId: v.id("rooms"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("strokes")
      .filter((q) => q.eq(q.field("roomId"), args.roomId))
      .order("asc")
      .collect();
  },
});

export const nextRound = mutation({
  args: {
    roomId: v.id("rooms"),
    hostId: v.string(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room || room.hostId !== args.hostId) {
      throw new Error("Only host can advance rounds");
    }

    const players = await ctx.db
      .query("players")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .collect();

    if (room.currentRound >= room.maxRounds) {
      // Game finished
      await ctx.db.patch(args.roomId, {
        status: "finished",
      });
      return { gameFinished: true };
    }

    // Get next artist (cycle through players)
    const currentArtistIndex = players.findIndex(p => p.userId === room.currentArtist);
    const nextArtistIndex = (currentArtistIndex + 1) % players.length;
    const nextArtist = players[nextArtistIndex];

    const newWord = await getRandomWord(ctx);

    await ctx.db.patch(args.roomId, {
      currentRound: room.currentRound + 1,
      currentArtist: nextArtist.userId,
      currentWord: newWord,
      roundStartTime: Date.now(),
      roundEndTime: Date.now() + 120000, // 2 minutes
    });

    return { 
      gameFinished: false, 
      newWord,
      artistId: nextArtist.userId,
      round: room.currentRound + 1,
    };
  },
});

export const hostRestartGame = mutation({
  args: {
    roomId: v.id("rooms"),
    hostId: v.string(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room || room.hostId !== args.hostId || room.status !== "finished") {
      throw new Error("Only host can restart finished games");
    }

    // Get current active players
    const players = await ctx.db
      .query("players")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .collect();

    // Create a new room with same settings
    const newInviteCode = generateInviteCode();
    
    const newRoomId = await ctx.db.insert("rooms", {
      name: `${room.name} (New Game)`,
      hostId: room.hostId,
      status: "waiting",
      currentRound: 0,
      maxRounds: room.maxRounds,
      inviteCode: newInviteCode,
      maxPlayers: room.maxPlayers,
    });

    // Move all active players to new room
    for (const player of players) {
      await ctx.db.insert("players", {
        roomId: newRoomId,
        userId: player.userId,
        name: player.name,
        email: player.email,
        score: 0, // Reset scores
        isActive: true,
        joinedAt: Date.now(),
      });
    }

    // Mark old room as restarted so all players get redirected
    await ctx.db.patch(args.roomId, {
      status: "restarted" as any,
    });

    return { 
      success: true, 
      newRoomId: newRoomId,
      newInviteCode: newInviteCode 
    };
  },
});

export const hostEndGame = mutation({
  args: {
    roomId: v.id("rooms"),
    hostId: v.string(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room || room.hostId !== args.hostId || room.status !== "finished") {
      throw new Error("Only host can end finished games");
    }

    // Mark room as archived so players get kicked out
    await ctx.db.patch(args.roomId, {
      status: "archived",
    });

    return { redirectToHome: true };
  },
});

export const getAllGuessesForRoom = internalQuery({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("guesses")
      .filter((q) => q.eq(q.field("roomId"), args.roomId))
      .collect();
  },
});

// Make this available as a regular query too for the replay page
export const getAllGuessesForRoomPublic = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("guesses")
      .filter((q) => q.eq(q.field("roomId"), args.roomId))
      .collect();
  },
});

export const getSketchesForRoom = internalQuery({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    const sketches = await ctx.db
      .query("sketches")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .collect();
    
    // Add image URLs
    const sketchesWithUrls = await Promise.all(
      sketches.map(async (sketch) => {
        const imageUrl = await ctx.storage.getUrl(sketch.imageStorageId);
        return {
          ...sketch,
          imageUrl
        };
      })
    );
    
    return sketchesWithUrls;
  },
});

export const getStrokesForRound = internalQuery({
  args: { 
    roomId: v.id("rooms"),
    round: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("strokes")
      .withIndex("by_room_round", (q) => 
        q.eq("roomId", args.roomId).eq("round", args.round)
      )
      .order("asc")
      .collect();
  },
});

export const saveSketch = mutation({
  args: {
    roomId: v.id("rooms"),
    imageStorageId: v.id("_storage"),
    artistId: v.string(),
    artistName: v.string(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room) throw new Error("Room not found");

    await ctx.db.insert("sketches", {
      roomId: args.roomId,
      round: room.currentRound,
      artistId: args.artistId,
      artistName: args.artistName,
      word: room.currentWord ?? "unknown",
      imageStorageId: args.imageStorageId,
      timestamp: Date.now(),
    });
  },
});

export const saveCanvasImage = mutation({
  args: {
    roomId: v.id("rooms"),
    artistId: v.string(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room || room.status !== "playing" || room.currentArtist !== args.artistId) {
      return null; // Silently fail if not authorized or game not active
    }

    // Generate upload URL for the image
    return await ctx.storage.generateUploadUrl();
  },
});

export const finalizeCanvasImage = mutation({
  args: {
    roomId: v.id("rooms"),
    artistId: v.string(),
    artistName: v.string(),
    imageStorageId: v.id("_storage"),
    round: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room) throw new Error("Room not found");

    const targetRound = args.round ?? room.currentRound;

    // Save or update the sketch for the specified round
    const existingSketch = await ctx.db
      .query("sketches")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .filter((q) => q.eq(q.field("round"), targetRound))
      .filter((q) => q.eq(q.field("artistId"), args.artistId))
      .first();

    if (existingSketch) {
      // Update existing sketch
      await ctx.db.patch(existingSketch._id, {
        imageStorageId: args.imageStorageId,
        timestamp: Date.now(),
      });
    } else {
      // Create new sketch
      await ctx.db.insert("sketches", {
        roomId: args.roomId,
        round: targetRound,
        artistId: args.artistId,
        artistName: args.artistName,
        word: room.currentWord ?? "unknown",
        imageStorageId: args.imageStorageId,
        timestamp: Date.now(),
      });
    }

    return { success: true };
  },
});

export const triggerCanvasSaveForArtist = mutation({
  args: {
    roomId: v.id("rooms"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room || room.currentArtist !== args.userId) {
      return null; // Only the current artist can save
    }

    // Generate upload URL for immediate canvas save
    return await ctx.storage.generateUploadUrl();
  },
});

export const triggerCanvasSave = internalAction({
  args: {
    roomId: v.id("rooms"),
    round: v.number(),
  },
  handler: async (ctx, args) => {
    // This is a server-side trigger to ensure canvas is saved
    // The actual saving will be done by the client via the normal save mechanism
    console.log(`Triggering canvas save for room ${args.roomId}, round ${args.round}`);
  },
});

export const generateRoundImage = internalAction({
  args: {
    roomId: v.id("rooms"),
    round: v.number(),
  },
  handler: async (ctx, args): Promise<{ imageUrl: string; svgContent: string; strokeCount: number } | null> => {
    // Get all strokes for this round
    const strokes: any[] = await ctx.runQuery(internal.game.getStrokesForRound, {
      roomId: args.roomId,
      round: args.round,
    });

    // Filter out live strokes, only get completed ones, and sort by timestamp
    const completedStrokes: any[] = strokes
      .filter((stroke: any) => !stroke.isLive)
      .sort((a: any, b: any) => a.timestamp - b.timestamp);
    
    if (completedStrokes.length === 0) {
      return null; // No drawing to capture
    }

    // Create canvas data as SVG (works server-side) - same logic as replay
    const canvasWidth = 800;
    const canvasHeight = 600;
    
    let svgPaths = '';
    
    // Render all strokes in order (same as replay final frame)
    completedStrokes.forEach((stroke: any) => {
      if (stroke.strokeData.length < 2) return;
      
      let pathData = `M ${stroke.strokeData[0].x} ${stroke.strokeData[0].y}`;
      for (let i = 1; i < stroke.strokeData.length; i++) {
        pathData += ` L ${stroke.strokeData[i].x} ${stroke.strokeData[i].y}`;
      }
      
      svgPaths += `<path d="${pathData}" stroke="${stroke.color}" stroke-width="${stroke.width}" stroke-linecap="round" stroke-linejoin="round" fill="none" />`;
    });

    const svgContent = `<svg width="${canvasWidth}" height="${canvasHeight}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvasWidth} ${canvasHeight}">
  <rect width="100%" height="100%" fill="white"/>
  ${svgPaths}
</svg>`;

    // Convert SVG to base64 data URL
    const base64Svg = Buffer.from(svgContent).toString('base64');
    const dataUrl = `data:image/svg+xml;base64,${base64Svg}`;

    console.log(`Generated image for round ${args.round} with ${completedStrokes.length} strokes`);

    return {
      imageUrl: dataUrl,
      svgContent: svgContent,
      strokeCount: completedStrokes.length
    };
  },
});