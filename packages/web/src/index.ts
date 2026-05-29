// Заглушка сайта (Фаза 0). Позже — discovery-витрина каталога.
const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  fetch() {
    return new Response(
      "Beer Log — закрытый B2B-каталог крафта. Фаза 0: discovery-витрина в разработке.",
      { headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  },
});
console.log(`web on http://localhost:${server.port}`);
