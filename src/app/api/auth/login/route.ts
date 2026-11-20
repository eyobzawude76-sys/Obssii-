import { type NextRequest, NextResponse } from "next/server";
import { setSessionCookie, verifyPassword } from "@/lib/auth";
import dbConnect from "@/lib/mongoose-connect";
import User from "@/models/User";

export async function POST(req: NextRequest) {
  await dbConnect();
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const identifier =
    typeof body?.identifier === "string"
      ? body.identifier.trim()
      : body?.email?.trim();
  const password = body?.password;
  if (!identifier || typeof password !== "string")
    return NextResponse.json(
      { error: "Username/email and password are required" },
      { status: 400 },
    );
  const user = await User.findOne({
    $or: [
      { email: identifier },
      { email: identifier.toLowerCase() },
      { username: identifier.toLowerCase() },
    ],
  });
  if (!user)
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  if (user.isActive === false)
    return NextResponse.json({ error: "Account is inactive" }, { status: 403 });
  const ok = await verifyPassword(password, user.password);
  if (!ok)
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  await setSessionCookie(user);
  return NextResponse.json({
    id: user._id,
    role: user.role,
    email: user.email,
    name: user.name,
  });
}
