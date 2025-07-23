import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { generateInviteCode, getRandomWord } from "./utils";
import { internal } from "./_generated/api";

export const createRoom = mutation({
  args: {
    name: v.string(),
    hostId: v.string(),
    hostName: v.string(),
    hostEmail: v.optional(v.string()),
    maxPlayers: v.optional(v.number()),
    maxRounds: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const inviteCode = generateInviteCode();
    
    const roomId = await ctx.db.insert("rooms", {
      name: args.name,
      hostId: args.hostId,
      status: "waiting",
      currentRound: 0,
      maxRounds: args.maxRounds ?? 5,
      inviteCode,
      maxPlayers: args.maxPlayers ?? 6,
    });

    // Add host as first player
    await ctx.db.insert("players", {
      roomId,
      userId: args.hostId,
      name: args.hostName,
      email: args.hostEmail,
      score: 0,
      isActive: true,
      joinedAt: Date.now(),
    });

    return { roomId, inviteCode };
  },
});

export const joinRoom = mutation({
  args: {
    inviteCode: v.string(),
    userId: v.string(),
    name: v.string(),
    email: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db
      .query("rooms")
      .filter((q) => q.eq(q.field("inviteCode"), args.inviteCode))
      .first();

    if (!room) {
      throw new Error("Room not found");
    }

    if (room.status !== "waiting") {
      throw new Error("Game already in progress");
    }

    const existingPlayers = await ctx.db
      .query("players")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .collect();

    if (existingPlayers.length >= room.maxPlayers) {
      throw new Error("Room is full");
    }

    const existingPlayer = existingPlayers.find(p => p.userId === args.userId);
    if (existingPlayer) {
      return { roomId: room._id, playerId: existingPlayer._id };
    }

    const playerId = await ctx.db.insert("players", {
      roomId: room._id,
      userId: args.userId,
      name: args.name,
      email: args.email,
      score: 0,
      isActive: true,
      joinedAt: Date.now(),
    });

    return { roomId: room._id, playerId };
  },
});

export const startGame = mutation({
  args: {
    roomId: v.id("rooms"),
    hostId: v.string(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room || room.hostId !== args.hostId) {
      throw new Error("Only the host can start the game");
    }

    const players = await ctx.db
      .query("players")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .collect();

    if (players.length < 2) {
      throw new Error("Need at least 2 players to start");
    }

    const word = await getRandomWord(ctx);
    const firstArtist = players[0].userId;

    await ctx.db.patch(args.roomId, {
      status: "playing",
      currentRound: 1,
      currentArtist: firstArtist,
      currentWord: word,
      roundStartTime: Date.now(),
      roundEndTime: Date.now() + 120000, // 2 minutes per round
    });

    return { word: word, artistId: firstArtist };
  },
});

export const getRoomState = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room) return null;

    const players = await ctx.db
      .query("players")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .collect();

    const currentRoundGuesses = room.status === "playing" ? 
      await ctx.db
        .query("guesses")
        .withIndex("by_room_round", (q) => 
          q.eq("roomId", args.roomId).eq("round", room.currentRound)
        )
        .collect() : [];

    return {
      room,
      players: players.sort((a, b) => b.score - a.score),
      currentRoundGuesses,
    };
  },
});

export const sendGameInvite = mutation({
  args: {
    roomId: v.id("rooms"),
    hostId: v.string(),
    inviteEmails: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room || room.hostId !== args.hostId) {
      throw new Error("Only host can send invites");
    }

    const host = await ctx.db
      .query("players")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .filter((q) => q.eq(q.field("userId"), args.hostId))
      .first();

    if (!host) {
      throw new Error("Host not found");
    }

    // Send invites via scheduler
    await ctx.scheduler.runAfter(0, internal.resend.sendGameInvite, {
      to: args.inviteEmails,
      roomName: room.name,
      inviteCode: room.inviteCode,
      hostName: host.name,
      roomId: args.roomId,
      hostId: args.hostId,
    });

    return { success: true };
  },
});

export const leaveRoom = mutation({
  args: {
    roomId: v.id("rooms"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room) {
      throw new Error("Room not found");
    }

    const player = await ctx.db
      .query("players")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .filter((q) => q.eq(q.field("userId"), args.userId))
      .first();

    if (!player) {
      return { success: true }; // Player already not in room
    }

    // Remove player from room
    await ctx.db.delete(player._id);

    // If host leaves, transfer host to another player or delete room
    if (room.hostId === args.userId) {
      const remainingPlayers = await ctx.db
        .query("players")
        .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
        .collect();

      if (remainingPlayers.length === 0) {
        // No players left, delete the room
        await ctx.db.delete(args.roomId);
        return { success: true, roomDeleted: true };
      } else {
        // Transfer host to the first remaining player
        const newHost = remainingPlayers[0];
        await ctx.db.patch(args.roomId, {
          hostId: newHost.userId,
        });
        return { success: true, newHostId: newHost.userId };
      }
    }

    return { success: true };
  },
});

export const getRoomInvites = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("invites")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .order("desc")
      .collect();
  },
});

export const markInviteAsJoined = mutation({
  args: {
    email: v.string(),
    inviteCode: v.string(),
    playerName: v.string(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db
      .query("rooms")
      .filter((q) => q.eq(q.field("inviteCode"), args.inviteCode))
      .first();
    
    if (!room) return;

    const invite = await ctx.db
      .query("invites")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .filter((q) => q.eq(q.field("email"), args.email))
      .first();

    if (invite && invite.status !== "joined") {
      await ctx.db.patch(invite._id, {
        status: "joined",
        joinedAt: Date.now(),
        joinedPlayerName: args.playerName,
        lastUpdated: Date.now(),
      });
    }
  },
});

export const getRoomByInviteCode = query({
  args: { inviteCode: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("rooms")
      .filter((q) => q.eq(q.field("inviteCode"), args.inviteCode))
      .first();
  },
});

export const removePlayer = mutation({
  args: {
    roomId: v.id("rooms"),
    hostId: v.string(),
    playerUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.roomId);
    if (!room || room.hostId !== args.hostId) {
      throw new Error("Only host can remove players");
    }

    if (args.playerUserId === args.hostId) {
      throw new Error("Host cannot remove themselves");
    }

    const player = await ctx.db
      .query("players")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .filter((q) => q.eq(q.field("userId"), args.playerUserId))
      .first();

    if (!player) {
      throw new Error("Player not found");
    }

    // Remove player from room
    await ctx.db.delete(player._id);

    return { success: true, removedPlayerName: player.name };
  },
});

export const findNewRoomForPlayer = query({
  args: {
    userId: v.string(),
    oldHostId: v.string(),
  },
  handler: async (ctx, args) => {
    // Find the most recent room where this host created a new game and this player is in it
    const playerRooms = await ctx.db
      .query("players")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    // Find rooms created by the same host that are in waiting status
    for (const playerRecord of playerRooms) {
      const room = await ctx.db.get(playerRecord.roomId);
      if (room && room.hostId === args.oldHostId && room.status === "waiting") {
        return { newRoomId: room._id };
      }
    }

    return null;
  },
});