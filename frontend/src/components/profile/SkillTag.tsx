import { Badge } from "../ui/Badge";

export function SkillTag({ skill }: { skill: string }) {
  return <Badge className="rounded-full border border-[#d7dde3] bg-[#f8fafc] px-3 py-1 text-sm font-medium text-[#2f2f2f]">{skill}</Badge>;
}
