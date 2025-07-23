import { Resend, vEmailId, vEmailEvent } from '@convex-dev/resend';
import { components, internal } from './_generated/api';
import { internalAction, internalMutation } from './_generated/server';
import { v } from 'convex/values';

export const resend: Resend = new Resend(components.resend, {
  testMode: false, // Set to false for production
  onEmailEvent: internal.resend.handleEmailEvent,
});

export const handleEmailEvent = internalMutation({
  args: {
    id: vEmailId,
    event: vEmailEvent,
  },
  handler: async (ctx, args) => {
    console.log("Email event:", args.id, args.event);
    
    // Find invite by email ID
    const invite = await ctx.db
      .query("invites")
      .withIndex("by_email_id", (q) => q.eq("emailId", args.id))
      .first();

    if (!invite) return;

    let newStatus = invite.status;
    
    // Map Resend events to our statuses
    switch (args.event.type) {
      case 'email.sent':
        newStatus = 'sent';
        break;
      case 'email.delivered':
        newStatus = 'delivered';
        break;
      case 'email.opened':
        newStatus = 'opened';
        break;
      case 'email.clicked':
        newStatus = 'clicked';
        break;
      case 'email.bounced':
      case 'email.complained':
        newStatus = 'failed';
        break;
    }

    // Update invite status
    if (newStatus !== invite.status) {
      await ctx.db.patch(invite._id, {
        status: newStatus,
        lastUpdated: Date.now(),
      });
    }
  },
});

// Mutation to create invite record
export const createInviteRecord = internalMutation({
  args: {
    roomId: v.id("rooms"),
    email: v.string(),
    invitedBy: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("invites", {
      roomId: args.roomId,
      email: args.email,
      invitedBy: args.invitedBy,
      invitedAt: Date.now(),
      status: "sending",
      lastUpdated: Date.now(),
    });
  },
});

// Mutation to update invite with email ID
export const updateInviteEmailId = internalMutation({
  args: {
    inviteId: v.id("invites"),
    emailId: v.string(),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.inviteId, {
      emailId: args.emailId,
      status: args.status as any,
      lastUpdated: Date.now(),
    });
  },
});

export const sendGameInvite = internalAction({
  args: {
    to: v.array(v.string()),
    roomName: v.string(),
    inviteCode: v.string(),
    hostName: v.string(),
    roomId: v.id("rooms"),
    hostId: v.string(),
  },
  handler: async (ctx, args) => {
    // Create individual invite links for each email
    const invites = args.to.map(email => {
      const encodedEmail = encodeURIComponent(email);
      return {
        email,
        joinUrl: `${process.env.NEXT_PUBLIC_APP_URL}/invite/${args.inviteCode}?email=${encodedEmail}`
      };
    });

    // Send individual emails to each recipient
    for (const invite of invites) {
      // Create invite record with "sending" status
      const inviteId = await ctx.runMutation(internal.resend.createInviteRecord, {
        roomId: args.roomId,
        email: invite.email,
        invitedBy: args.hostId,
      });

      try {
        const emailResult = await resend.sendEmail(ctx, {
        from: 'Draw & Guess Royale <send@quackduck.dev>',
        to: invite.email,
        subject: `🎨 Join "${args.roomName}" - Draw & Guess Royale!`,
        html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #3B82F6;">🎨 Draw & Guess Royale</h1>
          
          <p>Hi there!</p>
          
          <p><strong>${args.hostName}</strong> has invited you to join their drawing game: <strong>"${args.roomName}"</strong></p>
          
          <div style="background-color: #F3F4F6; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
            <h2 style="margin: 0; color: #1F2937;">Room Code: <span style="color: #3B82F6;">${args.inviteCode}</span></h2>
            <p style="margin: 10px 0;">Click below to join instantly:</p>
            <a href="${invite.joinUrl}" style="display: inline-block; background-color: #3B82F6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
              🎨 Join Game Now!
            </a>
            <p style="margin: 10px 0 0 0; font-size: 12px; color: #6B7280;">
              The link above will take you directly to the game - just enter your name to start playing!
            </p>
          </div>
          
          <p>Get ready to showcase your artistic skills and guess what others are drawing in this fast-paced multiplayer battle!</p>
          
          <p style="color: #6B7280; font-size: 14px;">
            Ready, set, sketch! 🖌️
          </p>
        </div>
        `,
        });

        // Update invite record with email ID and success status
        if (emailResult) {
          await ctx.runMutation(internal.resend.updateInviteEmailId, {
            inviteId,
            emailId: emailResult,
            status: "sent",
          });
        }
      } catch (error) {
        // Update invite record with failed status
        await ctx.runMutation(internal.resend.updateInviteEmailId, {
          inviteId,
          emailId: "",
          status: "failed",
        });
        console.error(`Failed to send invite to ${invite.email}:`, error);
      }
    }
  },
});

export const sendPlayerJoinedNotification = internalAction({
  args: {
    hostEmail: v.string(),
    hostName: v.string(),
    playerName: v.string(),
    roomName: v.string(),
    totalPlayers: v.number(),
  },
  handler: async (ctx, args) => {
    await resend.sendEmail(ctx, {
      from: 'Draw & Guess Royale <noreply@quackduck.dev>',
      to: args.hostEmail,
      subject: `🎉 ${args.playerName} joined your game!`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #059669;">🎉 New Player Alert!</h1>
          
          <p>Hi ${args.hostName}!</p>
          
          <p><strong>${args.playerName}</strong> just joined your game <strong>"${args.roomName}"</strong>!</p>
          
          <div style="background-color: #ECFDF5; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; font-size: 18px; text-align: center;">
              Players: <strong>${args.totalPlayers}</strong>
            </p>
          </div>
          
          <p>Ready to start the artistic battle? The more players, the more fun!</p>
          
          <p style="color: #6B7280; font-size: 14px;">
            🎨 Let the creativity flow!
          </p>
        </div>
      `,
    });
  },
});

export const sendRoundResults = internalAction({
  args: {
    playerEmails: v.array(v.string()),
    roomName: v.string(),
    roomId: v.id("rooms"),
    round: v.number(),
    word: v.string(),
    artistName: v.string(),
    sketchUrl: v.optional(v.string()),
    correctGuessers: v.array(v.object({
      name: v.string(),
      points: v.number(),
    })),
    leaderboard: v.array(v.object({
      name: v.string(),
      score: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    // Get stored sketch first, then generate if needed
    const sketches = await ctx.runQuery(internal.game.getSketchesForRoom, { roomId: args.roomId });
    const roundSketch = sketches?.find((s: any) => s.round === args.round);
    let actualSketchUrl = roundSketch?.imageUrl || args.sketchUrl;
    
    // If no stored sketch, generate from strokes
    if (!actualSketchUrl) {
      try {
        const generatedImage = await ctx.runAction(internal.game.generateRoundImage, {
          roomId: args.roomId,
          round: args.round,
        });
        actualSketchUrl = generatedImage?.imageUrl;
        console.log(`Generated image for round ${args.round} as fallback`);
      } catch (error) {
        console.log(`Could not generate image for round ${args.round}:`, error);
      }
    }
    const correctGuessersList = args.correctGuessers.length > 0 
      ? args.correctGuessers.map(g => `${g.name} (+${g.points} pts)`).join(', ')
      : 'No one guessed correctly!';

    // Send individual emails to each player
    for (const email of args.playerEmails) {
      await resend.sendEmail(ctx, {
        from: 'Draw & Guess Royale <noreply@quackduck.dev>',
        to: email,
      subject: `🎯 Round ${args.round} Results - "${args.roomName}"`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #3B82F6;">🎯 Round ${args.round} Complete!</h1>
          
          <div style="background-color: #F9FAFB; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h2 style="margin: 0 0 10px 0;">The word was: <span style="color: #059669;">"${args.word}"</span></h2>
            <p style="margin: 0;">Artist: <strong>${args.artistName}</strong></p>
          </div>

          ${actualSketchUrl ? `
            <div style="text-align: center; margin: 20px 0;">
              <img src="${actualSketchUrl}" alt="Round ${args.round} sketch" style="max-width: 400px; border-radius: 8px; border: 2px solid #E5E7EB;">
            </div>
          ` : `
            <div style="text-align: center; margin: 20px 0; padding: 20px; background-color: #F3F4F6; border-radius: 8px; border: 2px dashed #D1D5DB;">
              <p style="margin: 0; color: #6B7280; font-style: italic;">🎨 Canvas drawing was created during this round</p>
            </div>
          `}

          <div style="background-color: #ECFDF5; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin: 0 0 10px 0; color: #059669;">🏆 Correct Guesses</h3>
            <p style="margin: 0;">${correctGuessersList}</p>
          </div>

          <div style="background-color: #FEF2F2; padding: 15px; border-radius: 8px;">
            <h3 style="margin: 0 0 10px 0; color: #DC2626;">📊 Current Leaderboard</h3>
            ${args.leaderboard.map((player, index) => `
              <div style="display: flex; justify-content: space-between; padding: 5px 0; ${index === 0 ? 'font-weight: bold; color: #DC2626;' : ''}">
                <span>${index + 1}. ${player.name}</span>
                <span>${player.score} pts</span>
              </div>
            `).join('')}
          </div>

          <p style="text-align: center; color: #6B7280; margin-top: 30px;">
            Keep drawing and guessing! 🎨
          </p>
        </div>
        `,
      });
    }
  },
});

export const sendGameComplete = internalAction({
  args: {
    playerEmails: v.array(v.string()),
    roomName: v.string(),
    winner: v.object({
      name: v.string(),
      score: v.number(),
    }),
    finalLeaderboard: v.array(v.object({
      name: v.string(),
      score: v.number(),
    })),
    totalRounds: v.number(),
    roomId: v.optional(v.id("rooms")),
  },
  handler: async (ctx, args) => {
    // Get game statistics and round details
    let gameStats = '';
    let roundDetails = '';
    
    if (args.roomId) {
      // Get all guesses made
      const allGuesses = await ctx.runQuery(internal.game.getAllGuessesForRoom, { roomId: args.roomId });
      const correctGuesses = allGuesses?.filter((g: any) => g.isCorrect) || [];
      
      // Get all sketches with images
      const sketches = await ctx.runQuery(internal.game.getSketchesForRoom, { roomId: args.roomId });
      
      // Group guesses by round and get round details
      const roundsData = [];
      for (let round = 1; round <= args.totalRounds; round++) {
        const roundGuesses = allGuesses?.filter((g: any) => g.round === round) || [];
        const correctRoundGuesses = roundGuesses.filter((g: any) => g.isCorrect);
        
        // Get strokes for this round using the query function
        const roundStrokes = await ctx.runQuery(internal.game.getStrokesForRound, { 
          roomId: args.roomId!, 
          round: round 
        });
        
        // Get the artist for this round (first stroke artist)
        const completedStrokes = roundStrokes?.filter((s: any) => !s.isLive) || [];
        const artist = completedStrokes.length > 0 ? completedStrokes[0].artistId : "Unknown";
        
        // Get the word for this round from correct guesses
        const firstCorrectGuess = correctRoundGuesses.length > 0 ? correctRoundGuesses[0] : null;
        const roundWord = firstCorrectGuess?.guess || "Unknown Word";
        
        // Find sketch for this round
        const roundSketch = sketches?.find((s: any) => s.round === round);
        
        // Try to find artist name in leaderboard (simple match)
        let artistName = "Unknown Artist";
        for (const player of args.finalLeaderboard) {
          if (player.name && artist !== "Unknown") {
            artistName = player.name;
            break;
          }
        }
        
        // Use stored sketch first, then generate if needed
        let imageUrl = roundSketch?.imageUrl;
        if (!imageUrl && completedStrokes.length > 0) {
          try {
            const generatedImage = await ctx.runAction(internal.game.generateRoundImage, {
              roomId: args.roomId,
              round: round,
            });
            imageUrl = generatedImage?.imageUrl;
            console.log(`Generated image for game complete round ${round} as fallback`);
          } catch (error) {
            console.log(`Could not generate image for round ${round}:`, error);
          }
        }

        roundsData.push({
          round,
          guesses: roundGuesses.length,
          correctGuesses: correctRoundGuesses.length,
          firstCorrectGuesser: correctRoundGuesses.length > 0 ? correctRoundGuesses[0].playerName : null,
          artistName,
          hasDrawing: completedStrokes.length > 0,
          sketchUrl: imageUrl,
          word: roundWord
        });
      }
      
      gameStats = `
        <div style="background-color: #F3F4F6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin: 0 0 15px 0; color: #374151;">📊 Game Statistics</h3>
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
            <div style="text-align: center; background-color: white; padding: 10px; border-radius: 6px;">
              <div style="font-size: 24px; font-weight: bold; color: #3B82F6;">${args.totalRounds}</div>
              <div style="font-size: 14px; color: #6B7280;">Rounds Played</div>
            </div>
            <div style="text-align: center; background-color: white; padding: 10px; border-radius: 6px;">
              <div style="font-size: 24px; font-weight: bold; color: #059669;">${correctGuesses.length}</div>
              <div style="font-size: 14px; color: #6B7280;">Words Guessed</div>
            </div>
            <div style="text-align: center; background-color: white; padding: 10px; border-radius: 6px;">
              <div style="font-size: 24px; font-weight: bold; color: #DC2626;">${allGuesses?.length || 0}</div>
              <div style="font-size: 14px; color: #6B7280;">Total Guesses</div>
            </div>
          </div>
        </div>
      `;

      // Create detailed round breakdown
      roundDetails = `
        <div style="background-color: #F9FAFB; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin: 0 0 15px 0; color: #374151;">🎯 Round by Round Breakdown</h3>
          ${roundsData.map(round => `
            <div style="background-color: white; padding: 15px; margin: 10px 0; border-radius: 6px; border-left: 4px solid #3B82F6;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <h4 style="margin: 0; color: #1F2937;">Round ${round.round}: "${round.word}"</h4>
                <span style="background-color: #EFF6FF; color: #1E40AF; padding: 4px 8px; border-radius: 4px; font-size: 12px;">
                  ${round.artistName}
                </span>
              </div>
              
              ${round.sketchUrl ? `
                <div style="text-align: center; margin: 15px 0;">
                  <img src="${round.sketchUrl}" alt="Round ${round.round} drawing" style="max-width: 300px; max-height: 200px; border-radius: 8px; border: 2px solid #E5E7EB; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                </div>
              ` : `
                <div style="text-align: center; margin: 15px 0; padding: 20px; background-color: #F3F4F6; border-radius: 8px; border: 2px dashed #D1D5DB;">
                  <p style="margin: 0; color: #6B7280; font-style: italic;">🎨 Drawing created during this round</p>
                  <p style="margin: 5px 0 0 0; color: #9CA3AF; font-size: 12px;">Canvas capture feature coming soon!</p>
                </div>
              `}
              
              <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; font-size: 14px;">
                <div>📝 <strong>${round.guesses}</strong> total guesses</div>
                <div>✅ <strong>${round.correctGuesses}</strong> correct</div>
                ${round.firstCorrectGuesser ? `<div style="grid-column: span 2;">🏆 First correct: <strong>${round.firstCorrectGuesser}</strong></div>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }

    // Send individual emails to each player
    for (const email of args.playerEmails) {
      await resend.sendEmail(ctx, {
        from: 'Draw & Guess Royale <noreply@quackduck.dev>',
        to: email,
      subject: `🏆 Game Complete! Winner: ${args.winner.name} - "${args.roomName}"`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #DC2626; text-align: center;">🏆 GAME COMPLETE! 🏆</h1>
          
          <div style="background-color: #FEF2F2; padding: 30px; border-radius: 12px; text-align: center; margin: 30px 0; border: 3px solid #DC2626;">
            <h2 style="margin: 0; font-size: 24px;">🎉 CHAMPION 🎉</h2>
            <h3 style="margin: 10px 0; color: #DC2626; font-size: 28px;">${args.winner.name}</h3>
            <p style="margin: 0; font-size: 18px; color: #374151;">${args.winner.score} points</p>
          </div>

          ${gameStats}

          ${roundDetails}

          <div style="background-color: #F3F4F6; padding: 20px; border-radius: 8px;">
            <h3 style="margin: 0 0 15px 0; text-align: center;">📊 Final Leaderboard</h3>
            ${args.finalLeaderboard.map((player, index) => {
              const medalEmoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🎯';
              return `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; margin: 5px 0; background-color: white; border-radius: 6px;">
                  <span style="font-weight: bold;">${medalEmoji} ${index + 1}. ${player.name}</span>
                  <span style="color: #3B82F6; font-weight: bold;">${player.score} pts</span>
                </div>
              `;
            }).join('')}
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <p style="font-size: 16px; color: #374151;">Game lasted ${args.totalRounds} epic rounds!</p>
            <p style="color: #6B7280; font-style: italic;">"Great artists steal, but amazing artists win Draw & Guess Royale!"</p>
          </div>

          <div style="background-color: #EFF6FF; padding: 20px; border-radius: 8px; text-align: center;">
            <p style="margin: 0 0 15px 0; font-weight: bold;">🎬 Relive the Action!</p>
            
            <div style="margin: 15px 0;">
              <a href="${process.env.NEXT_PUBLIC_APP_URL}/replay/${args.roomId}" 
                 style="display: inline-block; background-color: #7C3AED; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 5px; font-weight: bold;">
                🎮 Watch Game Replay
              </a>
            </div>
            <p style="margin: 10px 0; color: #6B7280; font-size: 14px;">Watch every stroke animated round by round!</p>
            
            <p style="margin: 15px 0 10px 0; font-weight: bold;">Ready for another round?</p>
            <p style="margin: 0; color: #6B7280;">Share this epic battle on social media!</p>
            
            <div style="margin: 15px 0;">
              <a href="https://twitter.com/intent/tweet?text=Just+won+a+Draw+%26+Guess+Royale+battle%21+🎨🏆+Can+you+beat+my+artistic+skills%3F" 
                 style="display: inline-block; background-color: #1DA1F2; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px; margin: 5px;">
                Share on X
              </a>
              <a href="https://www.linkedin.com/sharing/share-offsite/?url=DrawAndGuessRoyale" 
                 style="display: inline-block; background-color: #0077B5; color: white; padding: 8px 16px; text-decoration: none; border-radius: 4px; margin: 5px;">
                Share on LinkedIn
              </a>
            </div>
          </div>
        </div>
        `,
      });
    }
  },
});

export const sendDailyDigest = internalAction({
  args: {
    emails: v.array(v.string()),
    topPlayers: v.array(v.object({
      name: v.string(),
      totalScore: v.number(),
      gamesPlayed: v.number(),
    })),
    totalGames: v.number(),
  },
  handler: async (ctx, args) => {
    // Send individual emails to each recipient
    for (const email of args.emails) {
      await resend.sendEmail(ctx, {
        from: 'Draw & Guess Royale <noreply@quackduck.dev>',
        to: email,
      subject: '📊 Daily Draw & Guess Royale Digest',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #3B82F6;">📊 Daily Artist Leaderboard</h1>
          
          <p>Here's yesterday's creative battlefield results!</p>

          <div style="background-color: #EFF6FF; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h2 style="margin: 0 0 15px 0; text-align: center;">🎨 Top Artists</h2>
            ${args.topPlayers.map((player, index) => {
              const medalEmoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🎯';
              return `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; margin: 3px 0; background-color: white; border-radius: 4px;">
                  <span>${medalEmoji} ${player.name}</span>
                  <span style="color: #3B82F6; font-weight: bold;">${player.totalScore} pts (${player.gamesPlayed} games)</span>
                </div>
              `;
            }).join('')}
          </div>

          <div style="text-align: center; background-color: #F3F4F6; padding: 15px; border-radius: 8px;">
            <p style="margin: 0; font-size: 18px;"><strong>${args.totalGames}</strong> total games played yesterday!</p>
          </div>

          <p style="text-align: center; margin: 30px 0;">
            Ready to climb the leaderboard today? 🚀
          </p>

          <p style="color: #6B7280; font-size: 14px; text-align: center;">
            Keep sketching, keep guessing, keep winning! 🎨
          </p>
        </div>
        `,
      });
    }
  },
});