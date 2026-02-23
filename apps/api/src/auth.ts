import bcrypt from "bcryptjs";

export type PublicUser = {
  id: number;
  username: string;
  email: string | null;
  avatar_url: string | null;
  display_name: string | null;
  is_admin: number;
  created_at: string;
};

export async function hashPassword(plainPassword: string): Promise<string> {
  const saltRounds = 12;
  return await bcrypt.hash(plainPassword, saltRounds);
}

export async function verifyPassword(plainPassword: string, passwordHash: string): Promise<boolean> {
  return await bcrypt.compare(plainPassword, passwordHash);
}




