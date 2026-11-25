import assert from "node:assert/strict";
import { NaturalLanguageCommandInterpreter } from "../src/lib/ctf/autonomous/natural-language-command-interpreter";
import { TerminalOutputReader } from "../src/lib/ctf/autonomous/terminal-output-reader";
import { EncodingDetectionEngine } from "../src/lib/ctf/autonomous/encoding-detection-engine";
import { ChallengeHintInterpreter } from "../src/lib/ctf/autonomous/challenge-hint-interpreter";
import { AntiRepetitionEngine } from "../src/lib/ctf/autonomous/anti-repetition-engine";
import { MultiStrategyValidator } from "../src/lib/ctf/autonomous/multi-strategy-validator";
import { FlagVerificationEngine } from "../src/lib/ctf/autonomous/flag-verification-engine";
import { extractServerVerifiedFlag } from "../src/lib/ctf/autonomous/oracle-flag-verifier";
import { ChallengeCompletionDetector } from "../src/lib/ctf/autonomous/challenge-completion-detector";
import { UserResponseController } from "../src/lib/ctf/autonomous/user-response-controller";
import { buildPairedCommands } from "../src/lib/ctf/autonomous/tool-pairing";
import { buildNetcatSolverCommand } from "../src/lib/ctf/autonomous/netcat-challenge-solver";
import { buildGitCloneCommand } from "../src/lib/ctf/autonomous/git-clone-challenge";
import { MultiStageChallengeManager } from "../src/lib/ctf/autonomous/multi-stage-challenge-manager";
import { categoryLabel, classifyChallenge } from "../src/lib/ctf/autonomous/challenge-category";
import { buildStepMeta, describeStepOutcome } from "../src/lib/ctf/autonomous/execution-step-meta";
import { AUTONOMOUS_LIMITS } from "../src/lib/ctf/autonomous/config";
import { ErrorRecoveryManager } from "../src/lib/ctf/autonomous/error-recovery-manager";
import { FinalAnswerVerifier } from "../src/lib/ctf/autonomous/final-answer-verifier";
import { StepProgressTracker } from "../src/lib/ctf/autonomous/step-progress-tracker";
import {
  CTFChallengeClassifier,
  ChallengeContextManager,
  ExecutionPlanGenerator,
  KaliCommandGenerator,
  LiveOutputReader,
  TerminalExecutionManager,
  HintInterpretationEngine,
  MultiMethodValidator,
} from "../src/lib/ctf/autonomous/required-modules";
import { validateTerminalCommand } from "../src/lib/ctf/terminal";
import { understandChallenge } from "../src/lib/ctf/autonomous/universal-understanding";
import { HypothesisReasoningEngine } from "../src/lib/ctf/autonomous/hypothesis-reasoning-engine";
import { formatFinalReport } from "../src/lib/ctf/autonomous/final-response-format";
import {
  assertAuthorizedUrl,
} from "../src/lib/ctf/platforms/authorized-fetch";
import { PlatformAuthorizationError } from "../src/lib/ctf/platforms/types";
import type {
  ChallengeStateRecord,
  ExecutionStep,
  StructuredPlan,
  VerificationContext,
} from "../src/lib/ctf/autonomous/types";

function testInterpreter(): void {
  const interpreter = new NaturalLanguageCommandInterpreter();
  const connect = interpreter.interpret({
    question: "Connect to CTF server host 127.0.0.1 port 2222 user ctf with password: hunter2",
    sessionId: "s1",
    language: "en",
  });
  assert.equal(connect.operation, "CONNECT_REMOTE");
  assert.equal(connect.target?.host, "127.0.0.1");
  assert.equal(connect.target?.port, 2222);
  assert.equal(connect.target?.username, "ctf");
  assert.ok(connect.extractedSecrets?.some((secret) => secret.field === "password" && secret.value === "hunter2"));
  assert.equal(connect.redactedQuestion.includes("hunter2"), false);
  assert.equal(connect.reason.includes("hunter2"), false);
  assert.equal(connect.missing.includes("profile"), false);
  assert.ok(connect.missing.includes("fingerprint"));

  const envPlan = interpreter.interpret({
    question: "Hubungkan dengan password env CTF_SSH_PASSWORD",
    sessionId: "s1",
    language: "id",
  });
  assert.ok(envPlan.requirements.some((item) => item.includes("CTF_SSH_PASSWORD")));
  assert.equal(envPlan.extractedSecrets, undefined);
  assert.equal(envPlan.target?.authMethod, "password");

  assert.equal(
    interpreter.interpret({ question: "Lanjutkan challenge", sessionId: "s1", language: "id" }).operation,
    "CONTINUE_CHALLENGE",
  );
  assert.equal(
    interpreter.interpret({ question: "status", sessionId: "s1", language: "id" }).operation,
    "CHECK_STATUS",
  );
  assert.equal(
    interpreter.interpret({ question: "check the answer", sessionId: "s1", language: "en" }).operation,
    "VERIFY_ANSWER",
  );
  assert.equal(
    interpreter.interpret({ question: "periksa jawabannya", sessionId: "s1", language: "id" }).operation,
    "VERIFY_ANSWER",
  );
  assert.equal(
    interpreter.interpret({ question: "jelaskan bagaimana kamu menyelesaikannya", sessionId: "s1", language: "id" }).operation,
    "EXPLAIN_SOLUTION",
  );
  assert.equal(
    interpreter.interpret({ question: "how did you solve this challenge", sessionId: "s1", language: "en" }).operation,
    "EXPLAIN_SOLUTION",
  );
  assert.equal(
    interpreter.interpret({ question: "find flag", sessionId: "s1", language: "id" }).operation,
    "SOLVE_UNTIL_FLAG",
  );
  assert.equal(
    interpreter.interpret({ question: "Analisis file ini dengan tool Kali", sessionId: "s1", language: "id" }).operation,
    "AUTO_ANALYZE",
  );
  assert.equal(
    interpreter.interpret({ question: "nc chatelaine.cylabacademy.net 32626", sessionId: "s1", language: "id" }).operation,
    "NETCAT_CONNECT",
  );
  const git = interpreter.interpret({
    question: "git clone ssh://git@chatelaine.cylabacademy.net:21269/git/challenge.git",
    sessionId: "s1",
    language: "id",
  });
  assert.equal(git.operation, "GIT_CLONE");
  assert.equal(git.target?.host, "chatelaine.cylabacademy.net");
  assert.equal(git.target?.port, 21269);
  assert.equal(git.target?.username, "git");
  assert.equal(git.target?.path, "/git/challenge.git");
  assert.equal(git.session.environment, "local-kali");
  assert.equal(git.missing.length, 0);

  assert.equal(
    interpreter.interpret({ question: "Stop, jangan lanjut", sessionId: "s1", language: "id" }).operation,
    "STOP",
  );
  assert.equal(
    interpreter.interpret({ question: "Apa itu XOR?", sessionId: "s1", language: "id" }).operation,
    "GENERAL_QUESTION",
  );
}

function testOutputReader(): void {
  const reader = new TerminalOutputReader();
  const reading = reader.read(
    "Hint: teks ini menggunakan ROT13\nUryyb gur synt vf synt{123_456}\nToken: SGVsbG8gQ1RGIQ==",
    "",
    "remote-ctf",
  );
  assert.ok(reading.observations.some((item) => item.kind === "hint" && /ROT13/i.test(item.text)));
  assert.ok(reading.encodedCandidates.some((token) => token === "SGVsbG8gQ1RGIQ=="));
  assert.ok(reading.observations.some((item) => item.kind === "encoded" && item.text === "SGVsbG8gQ1RGIQ=="));
}

function testEncodingEngine(): void {
  const engine = new EncodingDetectionEngine();

  const rot = engine.decode("Uryyb gur synt vf synt{123_456}");
  assert.ok(
    rot.some((attempt) => /rot13/i.test(attempt.method) && attempt.value.includes("flag{123_456}")),
    "ROT13 layer should be recovered",
  );
  assert.match(rot[0].value, /flag\{/, "flag-like output should rank first");

  const base64 = engine.decode("ZmxhZ3tiYXNlNjRfdGVzdH0=");
  assert.ok(
    base64.some((attempt) => /base64/i.test(attempt.method) && attempt.value === "flag{base64_test}"),
    "Base64 layer should be recovered",
  );
  assert.match(base64[0].value, /flag\{/, "flag-like output should rank first");

  const reading = new TerminalOutputReader().read(
    "Hint: ROT13\nUryyb gur synt vf synt{123_456}",
    "",
  );
  const interpretations = new ChallengeHintInterpreter(engine).interpret(reading, "en");
  assert.ok(interpretations.length > 0);
  assert.ok(interpretations.some((item) => item.selected?.value.includes("flag{")));
}

function testAntiRepetition(): void {
  const engine = new AntiRepetitionEngine();
  const repeated = engine.check("ls -la", ["ls -la"], 0);
  assert.equal(repeated.repeated, true);
  assert.match(repeated.reason, /verifikasi/i);
  assert.equal(engine.check("ls -la /tmp", ["ls -la"], 0).repeated, false);
}

function testVerification(): void {
  const verifier = new FlagVerificationEngine();
  const baseContext: VerificationContext = {
    hintTexts: ["Mungkin flag{prose_only}"],
    terminalOutputs: [],
    historyOutputs: [],
    serverCompletionIndicators: [],
    verificationAttempts: 0,
  };
  assert.equal(verifier.verify("flag{prose_only}", baseContext).status, "UNVERIFIED");

  const expectedContext: VerificationContext = {
    ...baseContext,
    expectedFlag: "flag{expected}",
  };
  assert.equal(verifier.verify("flag{expected}", expectedContext).status, "VERIFIED");
  assert.equal(verifier.verify("flag{other}", expectedContext).status, "CONFLICTED");

  const terminalContext: VerificationContext = {
    ...baseContext,
    terminalOutputs: ["$ cat note.txt\nflag{terminal_found}"],
  };
  assert.equal(verifier.verify("flag{terminal_found}", terminalContext).status, "POTENTIAL");

  const validator = new MultiStrategyValidator();
  const hintOnly = validator.validate({
    value: "flag{hint_only}",
    source: "hint",
    method: "decode",
    hintTexts: ["Petunjuk: flag{hint_only}"],
    terminalOutputs: [],
    historyOutputs: [],
    expectedFlag: "flag{something_else}",
  });
  assert.equal(hintOnly.oracleMatch, false);
  assert.equal(validator.select([hintOnly])?.id, hintOnly.id);
}

function testOracleFlagVerifier(): void {
  const traceback = `Traceback (most recent call last):
  File "<stdin>", line 33, in <module>
ConnectionRefusedError: [Errno 111] Connection refused [exit 1]`;
  const fake = "gvpsIz{dfz}";
  assert.equal(extractServerVerifiedFlag([traceback], [fake]), undefined);
  assert.equal(
    new FlagVerificationEngine().verify(fake, {
      hintTexts: [],
      terminalOutputs: [traceback],
      historyOutputs: [],
      serverCompletionIndicators: [],
      verificationAttempts: 1,
    }).status,
    "UNVERIFIED",
  );

  const real = "academy{Revers1ng_t3xt_Tr4nsf0rm@t10ns_8064a2ad}";
  const solved = `--- Step 5 ---
Correct!

Congratulations! You've recovered the original flag:
>>> ${real}
`;
  assert.equal(extractServerVerifiedFlag([solved], [fake, real]), real);
}

function testCompletion(): void {
  const verification = new FlagVerificationEngine().verify("flag{done}", {
    hintTexts: [],
    terminalOutputs: [],
    historyOutputs: [],
    expectedFlag: "flag{done}",
    serverCompletionIndicators: [],
    verificationAttempts: 1,
  });
  const detector = new ChallengeCompletionDetector();
  const clean = detector.detect({
    verification,
    continuationSignals: [],
    unresolvedTasks: [],
    stage: 1,
    hintTexts: [],
    observationTexts: [],
  });
  assert.equal(clean.completed, true);
  assert.equal(clean.status, "COMPLETED");

  const withSignal = detector.detect({
    verification,
    continuationSignals: ["Masih ada tahap berikutnya"],
    unresolvedTasks: [],
    stage: 1,
    hintTexts: [],
    observationTexts: [],
  });
  assert.equal(withSignal.completed, false);
  assert.equal(withSignal.continuationSignals.length > 0, true);

  const controller = new UserResponseController();
  assert.equal(controller.final({ language: "en", status: "COMPLETED", flag: "flag{done}" }), "Flag: flag{done}");
  assert.equal(
    controller.final({ language: "id", status: "UNSOLVED", missing: ["host", "port"] }),
    "Dibutuhkan: host, port.",
  );
  assert.ok(controller.message("id", "decoding").length > 0);
}

function testSpeculativeFlagNeverBecomesVerified(): void {
  const fake = "zfux{xzx}";
  const verification = new FlagVerificationEngine().verify(fake, {
    hintTexts: ["cylabacademy"],
    terminalOutputs: [],
    historyOutputs: [`${fake}|tf`],
    expectedFlag: undefined,
    serverCompletionIndicators: [],
    verificationAttempts: 2,
  });
  assert.equal(verification.status === "VERIFIED", false);

  const completion = new ChallengeCompletionDetector().detect({
    verification,
    continuationSignals: ["next stage"],
    unresolvedTasks: ["cylabacademy"],
    stage: 2,
    hintTexts: ["cylabacademy"],
    observationTexts: [`${fake}|tf`],
  });
  assert.equal(completion.status !== "VERIFIED", true);
  assert.equal(completion.status !== "COMPLETED", true);

  const state = { verifiedFlag: undefined, stage: 1, finalStatus: "UNSOLVED", unresolvedTasks: [], currentStageIndicator: "" } as unknown as ChallengeStateRecord;
  const memory = {
    addUnresolved: (target: ChallengeStateRecord, value: string) => target.unresolvedTasks.push(value),
  } as unknown as ConstructorParameters<typeof MultiStageChallengeManager>[0];
  new MultiStageChallengeManager(memory).advance(state, ["next stage"], completion);
  assert.equal(state.verifiedFlag, undefined);

  const final = new FlagVerificationEngine().verify(fake, {
    hintTexts: [],
    terminalOutputs: [],
    historyOutputs: [`${fake}|tf`],
    expectedFlag: undefined,
    serverCompletionIndicators: [],
    oracleAccepted: Boolean(state.verifiedFlag && state.verifiedFlag === fake),
    verificationAttempts: 3,
  });
  assert.equal(final.status === "VERIFIED", false);
  assert.equal(
    new UserResponseController().final({ language: "id", status: "POTENTIAL_FLAG", flag: fake }),
    `Kandidat flag: ${fake}. Belum terverifikasi.`,
  );
}

function testGitClone(): void {
  const command = buildGitCloneCommand({
    host: "chatelaine.cylabacademy.net",
    port: 21269,
    username: "git",
    path: "/git/challenge.git",
  });
  assert.ok(command.includes("ssh://git@chatelaine.cylabacademy.net:21269/git/challenge.git"));
  assert.ok(command.includes("StrictHostKeyChecking=accept-new"));
  assert.ok(command.includes("BatchMode=yes"));
  assert.ok(command.includes("UserKnownHostsFile=/work/.ssh/known_hosts"));
  assert.ok(command.includes("git clone"));
  assert.ok(command.includes("/work/challenge"));
  assert.equal(validateTerminalCommand(command).ok, true);
  assert.throws(
    () => buildGitCloneCommand({ host: "host; rm -rf /", port: 22, path: "/git/challenge.git" }),
    /Host git tidak valid/,
  );
  assert.throws(
    () => buildGitCloneCommand({ host: "host", port: 22, path: "/git/..;touch /tmp/x" }),
    /Path repository git tidak valid/,
  );
}

function testToolPairing(): void {
  const tools = [
    "file", "strings", "exiftool", "readelf", "objdump", "tshark", "binwalk",
    "checksec", "pdfinfo", "zsteg", "steghide", "foremost", "vol", "r2",
    "ghidra", "gdb", "nmap", "hashcat", "john", "docker",
  ];
  const files = [
    { id: "f1", name: "challenge.bin", target: "/analysis/challenge.bin", size: 128 },
    { id: "f2", name: "capture.pcap", target: "/analysis/capture.pcap", size: 128 },
    { id: "f3", name: "doc.pdf", target: "/analysis/doc.pdf", size: 128 },
    { id: "f4", name: "image.png", target: "/analysis/image.png", size: 128 },
    { id: "f5", name: "audio.wav", target: "/analysis/audio.wav", size: 128 },
    { id: "f6", name: "mem.dump", target: "/analysis/mem.dump", size: 128 },
  ];
  const commands = buildPairedCommands({
    files,
    tools,
    question: "Analisis binary, pcap, pdf, png, wav, dan memory dump ini; nmap scan 192.168.65.254",
    output: "5d41402abc4b2a76b9719d911017c592",
    cycle: 0,
  }).join("\n");
  for (const tool of tools.filter((item) => item !== "docker")) {
    assert.ok(
      commands.includes(tool === "vol" ? "vol -f" : tool === "r2" ? "r2 -q" : tool),
      `tool pairing should include ${tool}`,
    );
  }
}

function testStepTracker(): void {
  const samples: Array<[string, string]> = [
    ["Kriptografi ROT13 base64 cipher", "Kriptografi"],
    ["Steganografi gambar PNG zsteg", "Steganografi"],
    ["Forensik digital memory dump", "Forensik Digital"],
    ["Reverse engineering biner ELF ghidra", "Reverse Engineering"],
    ["Binary exploitation stack overflow ROP", "Binary Exploitation"],
    ["Web security SQL injection cookie", "Web Security"],
    ["Network analysis pcap tshark", "Analisis Jaringan"],
    ["OSINT domain github username", "OSINT"],
    ["Pemrograman python algoritma", "Pemrograman"],
    ["Challange tanpa petunjuk", "Lainnya"],
  ];
  for (const [text, label] of samples) {
    assert.equal(categoryLabel(classifyChallenge(text).category), label, `kategori untuk "${text}"`);
  }

  const plan = { operation: "GIT_CLONE" } as StructuredPlan;
  const first = buildStepMeta(plan, 0);
  assert.ok(first.title && first.objective && first.nextAction);
  assert.equal(buildStepMeta(plan, 1).title, "Inventarisasi repository");

  const base = {
    commandStatus: "ok" as const,
    exitCode: 0,
    stderr: "",
    output: "",
    failureIndicators: [],
    successIndicators: [],
    continuationSignals: [],
    candidates: [],
    completion: { completed: false, status: "UNSOLVED", reason: "belum selesai" },
  };
  const failed = describeStepOutcome({
    ...base,
    commandStatus: "error",
    exitCode: 1,
    stderr: "Connection refused",
  });
  assert.match(failed.interpretation, /kegagalan/);
  assert.match(failed.result, /exit 1/);
  assert.match(failed.nextAction, /alternatif/);

  const candidate = describeStepOutcome({ ...base, candidates: [{ value: "flag{speculatif}" }] });
  assert.match(candidate.interpretation, /belum ada penerimaan server/);
  assert.match(candidate.nextAction, /Verifikasi/);

  const continued = describeStepOutcome({ ...base, continuationSignals: ["Step 2: decode lagi"] });
  assert.match(continued.nextAction, /lanjutan/);

  const verified = describeStepOutcome({
    ...base,
    completion: { completed: true, status: "COMPLETED", reason: "server menerima", flag: "flag{nyata}" },
  });
  assert.match(verified.result, /flag\{nyata\}/);

  const step: ExecutionStep = {
    id: "step-1",
    index: 1,
    title: first.title,
    objective: first.objective,
    reason: first.reason,
    expected: first.expected,
    command: "git clone ssh://git@host:22/repo.git",
    environment: "local-kali",
    status: "PENDING",
    output: "",
    interpretation: "",
    result: "",
    nextAction: first.nextAction,
  };
  for (const key of [
    "index",
    "title",
    "objective",
    "reason",
    "expected",
    "command",
    "status",
    "output",
    "interpretation",
    "result",
    "nextAction",
  ]) {
    assert.ok(key in step, `field ${key} harus ada di model step`);
  }
}

function testNetcatSolver(): void {
  const command = buildNetcatSolverCommand("chatelaine.cylabacademy.net", 32626);
  assert.ok(command.startsWith("printf '%s' '"));
  assert.ok(command.includes(" | base64 -d | python3"));
  const encoded = command.match(/'([A-Za-z0-9+/=]+)'/)?.[1] || "";
  const script = Buffer.from(encoded, "base64").toString("utf8");
  assert.ok(script.includes("H='chatelaine.cylabacademy.net'"));
  assert.ok(script.includes("P=32626"));
  assert.ok(script.includes("PROMPT='Enter the Linux command to reverse it:'"));
  assert.ok(script.includes("PRESS=re.compile"));
  assert.ok(script.includes("FLAG=re.compile"));
  assert.ok(script.includes("base64 -d"));
  assert.ok(script.includes("tr '()' '{}'"));
  assert.ok(command.length < 4000);
}

function testFinalAnswerVerifier(): void {
  const verifier = new FinalAnswerVerifier();
  const flag = "flag{confirmed}";
  const context = {
    hintTexts: [],
    terminalOutputs: [`$ cat out.txt\n${flag}`],
    historyOutputs: [],
    serverCompletionIndicators: [],
    verificationAttempts: 1,
  };
  const flags = new FlagVerificationEngine();
  const confirmed = verifier.verify({
    verification: flags.verify(flag, { ...context, expectedFlag: flag }),
    completion: { status: "COMPLETED", completed: true, reason: "verified", continuationSignals: [], flag },
    terminalOutputs: context.terminalOutputs,
    historyOutputs: [],
    stage: 1,
  });
  assert.equal(confirmed.classification, "CONFIRMED");
  assert.equal(confirmed.confirmed, true);

  const potential = flags.verify(flag, context);
  const high = verifier.verify({
    verification: potential,
    completion: { status: "POTENTIAL_FLAG", completed: false, reason: "terminal only", continuationSignals: [], flag },
    terminalOutputs: [`$ cat a.txt\n${flag}`, `$ xxd b.bin\n${flag}`],
    historyOutputs: [],
    stage: 1,
  });
  assert.equal(high.classification, "HIGH CONFIDENCE");
  assert.equal(high.confirmed, false);

  const probable = verifier.verify({
    verification: potential,
    completion: { status: "POTENTIAL_FLAG", completed: false, reason: "terminal only", continuationSignals: [], flag },
    terminalOutputs: context.terminalOutputs,
    historyOutputs: [],
    stage: 1,
  });
  assert.equal(probable.classification, "PROBABLE");
  assert.equal(probable.confirmed, false);

  const missing = verifier.verify({
    verification: flags.verify("", context),
    completion: { status: "UNSOLVED", completed: false, reason: "no candidate", continuationSignals: [] },
    terminalOutputs: [],
    historyOutputs: [],
    stage: 1,
  });
  assert.equal(missing.classification, "UNVERIFIED");

  const conflicted = flags.verify(flag, { ...context, expectedFlag: "flag{different}" });
  const rejected = verifier.verify({
    verification: conflicted,
    completion: { status: "UNSOLVED", completed: false, reason: "conflict", continuationSignals: [] },
    terminalOutputs: context.terminalOutputs,
    historyOutputs: [],
    stage: 1,
  });
  assert.equal(rejected.classification, "REJECTED");
  assert.equal(rejected.confirmed, false);
}

function testRequiredModulesAndLimits(): void {
  const modules = {
    classifier: new CTFChallengeClassifier(),
    context: new ChallengeContextManager(),
    plan: new ExecutionPlanGenerator(),
    commands: new KaliCommandGenerator(),
    terminal: new TerminalExecutionManager(),
    output: new LiveOutputReader(),
    hints: new HintInterpretationEngine(),
    progress: new StepProgressTracker(() => {}, "req"),
    recovery: new ErrorRecoveryManager(),
    validator: new MultiMethodValidator(),
    verifier: new FinalAnswerVerifier(),
  };
  assert.equal(modules.classifier.classify("base64 decode").label, "Kriptografi");
  assert.match(modules.recovery.suggest({
    errorText: "Connection refused",
    command: "nc host 1",
    history: [],
    category: "Network Analysis",
  }), /Koneksi gagal/);
  assert.match(modules.recovery.suggest({
    errorText: "command not found",
    command: "tool",
    history: [],
    category: "Miscellaneous",
  }), /Tool tidak tersedia/);
  assert.ok(AUTONOMOUS_LIMITS.maxIterations >= 1 && AUTONOMOUS_LIMITS.maxIterations <= 100);
  assert.ok(AUTONOMOUS_LIMITS.timeBudgetMs >= 5_000);
  assert.ok(AUTONOMOUS_LIMITS.commandTimeoutMs >= 1_000);
  assert.ok(AUTONOMOUS_LIMITS.maxOutputBytes >= 2_000);
  assert.equal(typeof modules.plan.summarize, "function");
  assert.equal(typeof modules.commands.gitClone, "function");
  assert.equal(typeof modules.terminal.execute, "function");
  assert.equal(typeof modules.output.read, "function");
  assert.equal(typeof modules.hints.decode, "function");
  assert.equal(typeof modules.validator.validate, "function");
}

function testUniversalUnderstandingAndPlatformSafety(): void {
  const understanding = understandChallenge({
    title: "Packet Mystery",
    files: [{ name: "capture.pcapng" }],
    terminalOutputs: ["No. Time Source Destination Protocol Length Info http.request GET /"],
    hints: ["Hint: lihat HTTP stream."],
  });
  assert.equal(understanding.category, "network-analysis");
  assert.ok(understanding.classificationEvidence.length >= 2);
  assert.ok(understanding.requiredTools.includes("tshark"));
  assert.ok(understanding.missingInformation.some((item) => item.includes("Format flag")));

  const hypotheses = new HypothesisReasoningEngine().build(understanding);
  assert.ok(hypotheses.length >= 1);
  assert.equal(hypotheses[0].status, "supported");
  assert.ok(hypotheses[0].supportingEvidence.length >= 2);
  assert.ok(hypotheses[0].id.startsWith("hyp_"));

  const report = formatFinalReport({
    challengeName: "Packet Mystery",
    status: "Partially Completed",
    answer: "",
    steps: ["Inspeksi artefak"],
    commands: ["tshark -r capture.pcapng"],
    outputs: ["http.request"],
    verification: "Belum ada oracle",
  });
  assert.match(report, /CHALLENGE:\nPacket Mystery/);
  assert.match(report, /STATUS:\nPartially Completed/);
  assert.match(report, /SHORT SOLUTION:\n1\. Inspeksi artefak/);
  assert.match(report, /VERIFICATION:\nBelum ada oracle/);

  assert.ok(
    assertAuthorizedUrl("https://instance.ctfd.io/api/v1/challenges", "https://ctfd.io", { authorized: true }),
  );
  assert.throws(
    () => assertAuthorizedUrl("https://evil.example/x", "https://ctfd.io", { authorized: true }),
    PlatformAuthorizationError,
  );
  assert.throws(
    () => assertAuthorizedUrl("http://127.0.0.1:8080/x", "https://ctfd.io", { authorized: true }),
    PlatformAuthorizationError,
  );
  assert.throws(
    () => assertAuthorizedUrl("https://ctfd.io/x", "https://ctfd.io", { authorized: false }),
    PlatformAuthorizationError,
  );
}

testFinalAnswerVerifier();
testUniversalUnderstandingAndPlatformSafety();
testRequiredModulesAndLimits();
testInterpreter();
testStepTracker();
testNetcatSolver();
testGitClone();
testToolPairing();
testOutputReader();
testEncodingEngine();
testAntiRepetition();
testVerification();
testOracleFlagVerifier();
testSpeculativeFlagNeverBecomesVerified();
testCompletion();
console.log("✓ ctf autonomous modules: interpreter, step tracker, netcat solver, tool pairing, reader, encoding, hints, repetition, validation, oracle, completion, response, final answer, required modules, universal understanding, hypotheses, platform safety, limits");
