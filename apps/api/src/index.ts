import Fastify from 'fastify'

const app = Fastify()

app.get('/health', async () => {
  return { ok: true }
})

const port = process.env.PORT || 8080
app.listen({ port: Number(port), host: '0.0.0.0' }, () => {
  console.log(`🚀 Server running on port ${port}`)
})
