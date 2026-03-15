export async function GET() {
  const API_KEY = process.env.YOUTUBE_API_KEY
  const CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID || 'UC7c3Kb6jYCRj4JOHHZTxKsQ'

  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/search?key=${API_KEY}&channelId=${CHANNEL_ID}&part=snippet,id&order=date&maxResults=8`,
    { next: { revalidate: 3600 } }
  )

  const data = await res.json()

  const videos = (data.items ?? [])
    .filter((item: { id: { videoId?: string } }) => item.id.videoId)
    .map((item: { id: { videoId: string }; snippet: { title: string; thumbnails: { high: { url: string } }; publishedAt: string } }) => ({
      id: item.id.videoId,
      title: item.snippet.title,
      thumbnail: item.snippet.thumbnails.high.url,
      date: new Date(item.snippet.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    }))

  return Response.json(videos)
}
