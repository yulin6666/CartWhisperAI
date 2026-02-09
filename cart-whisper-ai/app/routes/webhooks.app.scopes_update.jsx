import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  try {
    const { payload, session, topic, shop } = await authenticate.webhook(request);

    const current = payload.current;

    if (session) {
      await db.session.update({
        where: {
          id: session.id,
        },
        data: {
          scope: current.toString(),
        },
      });
    }

    return new Response();
  } catch (error) {
    // Return 401 for authentication errors (including HMAC validation failures)
    return new Response(null, { status: 401 });
  }
};
