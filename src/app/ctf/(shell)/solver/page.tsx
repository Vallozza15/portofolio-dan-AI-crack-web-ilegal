import { CtfChat } from "@/components/ctf/chat";
import { requirePageAuth } from "@/lib/ctf/auth";
import { getPublicProviderConfigs } from "@/lib/ctf/ai";
import { listChallenges, listFiles, listMessages, listSessions, getSettings } from "@/lib/ctf/store";
import { getPublicSettings } from "@/lib/ctf/settings";

export const dynamic = "force-dynamic";

export const metadata = { title: "AI CTF Solver" };

export default async function SolverPage({
  searchParams,
}: {
  searchParams: Promise<{ challenge?: string }>;
}) {
  await requirePageAuth();
  const params = await searchParams;
  const [challenges, files, sessions, providers, settings, publicSettings] = await Promise.all([
    listChallenges(),
    listFiles(),
    listSessions(),
    getPublicProviderConfigs(),
    getSettings(),
    getPublicSettings(),
  ]);
  const enriched = await Promise.all(
    sessions.slice(0, 60).map(async (session) => ({
      ...session,
      challengeTitle: challenges.find((challenge) => challenge.id === session.challengeId)?.title,
      messageCount: (await listMessages(session.id)).length,
    })),
  );
  const initialChallenge = params.challenge && challenges.some((item) => item.id === params.challenge)
    ? params.challenge
    : "";

  return (
    <CtfChat
      challenges={challenges}
      files={files}
      sessions={enriched}
      providers={providers}
      defaultMode="learning"
      defaultLanguage={settings.system.defaultLanguage}
      defaultProvider={publicSettings.ai.defaultProvider}
      maxUploadMb={settings.system.maxUploadMb}
      initialChallengeId={initialChallenge}
    />
  );
}
