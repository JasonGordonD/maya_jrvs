// TODO: Deploy mjrvs_llm edge function with provider-backed chat routing.
Deno.serve((_req) => {
  return new Response(
    JSON.stringify({ error: "mjrvs_llm not yet deployed" }),
    {
      status: 501,
      headers: { "Content-Type": "application/json" },
    }
  );
});
