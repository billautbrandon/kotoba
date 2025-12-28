import bcrypt from "bcryptjs";

export type PublicUser = {
  id: number;
  username: string;
  created_at: string;
};

export async function hashPassword(plainPassword: string): Promise<string> {
  const saltRounds = 12;
  return await bcrypt.hash(plainPassword, saltRounds);
}

export async function verifyPassword(plainPassword: string, passwordHash: string): Promise<boolean> {
  return await bcrypt.compare(plainPassword, passwordHash);
}



