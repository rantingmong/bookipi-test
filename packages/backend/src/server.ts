import { app } from '#app'

const port = Number(process.env.PORT ?? 3001)

app.listen(port, () => {
  process.stdout.write(`Backend listening on port ${port}\n`)
})
