import bcrypt from "bcryptjs";

export type PublicUser = {
  id: number;
  username: string;
  email: string | null;
  avatar_url: string | null;
  display_name: string | null;
  is_admin: number;
  xp: number;
  level: number;
  xpInLevel: number;
  xpForNextLevel: number;
  created_at: string;
  placement_level: string | null;
  placement_completed_at: string | null;
};

export async function hashPassword(plainPassword: string): Promise<string> {
  const saltRounds = 12;
  return await bcrypt.hash(plainPassword, saltRounds);
}

export async function verifyPassword(
  plainPassword: string,
  passwordHash: string,
): Promise<boolean> {
  return await bcrypt.compare(plainPassword, passwordHash);
}
