// /workflows/playlistWorkflow.ts

import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { tools } from "./tools"; // your tool exports (spotify.ts, music.ts, etc.)

type Params = {
  mood: string;
  playlistName: string;
};

export class PlaylistWorkflow extends WorkflowEntrypoint<Env, Params> {
  async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
    const { mood, playlistName } = event.params;

    // 1. Recommend songs by mood
    const recommendedSongs = await step.do("recommend songs", async () => {
      return await tools.getSongsByMood.execute({ mood });
    });

    if (!recommendedSongs || recommendedSongs.length === 0) {
      return `No songs found for mood "${mood}".`;
    }

    // 2. Confirm with user (could be human-in-the-loop or auto-confirm)
    const confirmed = await step.do("confirm songs", async () => {
      return await tools.confirmAddRecommendedSongs.execute({
        songs: recommendedSongs
      });
    });

    if (!confirmed) {
      return "Playlist creation canceled by user.";
    }

    // 3. Create Spotify playlist
    const result = await step.do("create Spotify playlist", async () => {
      return await tools.createSpotifyPlaylist.execute({
        mood,
        playlistName
      });
    });

    return result;
  }
}
