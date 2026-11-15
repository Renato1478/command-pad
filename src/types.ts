export type Category = { id: string; name: string };
export type Command = {
  id: string;
  name: string;
  body: string;
  category_id: string | null;
};
export type Data = { categories: Category[]; commands: Command[] };
