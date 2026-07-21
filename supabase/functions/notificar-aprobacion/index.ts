// Edge Function: envía un correo de "fuiste aceptado" usando Resend.
// La clave RESEND_API_KEY se lee como secreto del proyecto (nunca del código del navegador).

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const { correo, nombre } = await req.json();

    if (!correo) {
      return new Response(JSON.stringify({ error: "Falta el correo del candidato" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");

    const respuesta = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Camaron <onboarding@resend.dev>",
        to: [correo],
        subject: "¡Fuiste aceptado! 🎉",
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
            <h2 style="color: #059669;">¡Felicidades${nombre ? ", " + nombre : ""}!</h2>
            <p>Tu postulación en <strong>Camaron</strong> fue <strong>aprobada</strong>.</p>
            <p>Un reclutador se pondrá en contacto contigo pronto para los siguientes pasos.</p>
            <p style="color: #78716c; font-size: 12px; margin-top: 24px;">Este es un correo automático, por favor no respondas a este mensaje.</p>
          </div>
        `,
      }),
    });

    const datos = await respuesta.json();

    return new Response(JSON.stringify(datos), {
      status: respuesta.ok ? 200 : 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
