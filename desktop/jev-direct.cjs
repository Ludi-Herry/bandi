const {
  createHash,
  createHmac,
  timingSafeEqual,
} = require("node:crypto");

const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const MODEL_ID = "jev-1.13.0";
const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_BRIDGE_BYTES = 192 * 1024;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;
const FIT_GROUPS = ["fits", "possible", "not_fit", "insufficient"];

class JevDirectError extends Error {
  constructor(code) {
    super(code);
    this.name = "JevDirectError";
    this.code = code;
  }
}

function fail(code) {
  throw new JevDirectError(code);
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value, expected) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return JSON.stringify(actual) === JSON.stringify(wanted);
}

function isUnit(value) {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function isCount(value) {
  return Number.isInteger(value) && value >= 0;
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function verifySignature(payloadJson, signature, bridgeSecret) {
  if (
    typeof bridgeSecret !== "string" ||
    bridgeSecret.length < 32 ||
    typeof signature !== "string" ||
    !/^[a-f0-9]{64}$/u.test(signature)
  ) {
    fail("JEV_BRIDGE_SIGNATURE_INVALID");
  }
  const expected = createHmac("sha256", bridgeSecret)
    .update(payloadJson, "utf8")
    .digest("hex");
  if (
    !timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expected, "hex"),
    )
  ) {
    fail("JEV_BRIDGE_SIGNATURE_INVALID");
  }
}

function assertNoSensitiveOutboundData(state) {
  const visit = (value, key = "") => {
    if (typeof value === "string") {
      if (
        /(?:^|[\s"'(])(?:[A-Za-z]:\\|\\\\)/mu.test(value) ||
        /\bfile:\/\//iu.test(value)
      ) {
        fail("JEV_ABSOLUTE_PATH_IN_STATE");
      }
      if (
        /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/iu.test(value) ||
        /\b(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})\b/u.test(
          value,
        ) ||
        /Authorization\s*:\s*Bearer\s+\S{12,}/iu.test(value)
      ) {
        fail("JEV_SECRET_LIKE_CONTENT");
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, key));
      return;
    }
    if (!isPlainObject(value)) fail("JEV_STATE_INVALID");
    for (const [childKey, child] of Object.entries(value)) {
      if (
        /(^|_)(password|passwd|secret|api[-_]?key|token|cookie|authorization|private[-_]?key)($|_)/iu.test(
          childKey,
        )
      ) {
        fail("JEV_SENSITIVE_FIELD_NAME");
      }
      visit(child, childKey);
    }
  };
  visit(state);
}

function validateProviderRequest(request) {
  if (
    !isPlainObject(request) ||
    !hasExactKeys(request, ["model", "state", "questions"]) ||
    request.model !== MODEL_ID ||
    !isPlainObject(request.state) ||
    !hasExactKeys(request.state, ["sample_id", "preference", "candidates"]) ||
    request.state.sample_id !== "mood-picker-preview" ||
    typeof request.state.preference !== "string" ||
    request.state.preference.length < 2 ||
    request.state.preference.length > 160 ||
    !Array.isArray(request.state.candidates) ||
    request.state.candidates.length !== 8 ||
    !isPlainObject(request.questions)
  ) {
    fail("JEV_PROVIDER_REQUEST_INVALID");
  }

  request.state.candidates.forEach((candidate, index) => {
    if (
      !isPlainObject(candidate) ||
      !hasExactKeys(candidate, ["candidate_id", "title", "synopsis", "tags"]) ||
      ![`candidate-${index + 1}`, `empty-${index + 1}`].includes(
        candidate.candidate_id,
      ) ||
      typeof candidate.title !== "string" ||
      candidate.title.length > 120 ||
      typeof candidate.synopsis !== "string" ||
      candidate.synopsis.length > 600 ||
      !Array.isArray(candidate.tags) ||
      candidate.tags.length > 8 ||
      candidate.tags.some(
        (tag) => typeof tag !== "string" || tag.length < 1 || tag.length > 30,
      )
    ) {
      fail("JEV_PROVIDER_CANDIDATE_INVALID");
    }
  });

  const questionIds = Object.keys(request.questions).sort();
  const expectedIds = Array.from(
    { length: 8 },
    (_, index) => `candidate_${index + 1}_fit`,
  ).sort();
  if (JSON.stringify(questionIds) !== JSON.stringify(expectedIds)) {
    fail("JEV_QUESTIONS_INVALID");
  }
  for (const question of Object.values(request.questions)) {
    if (
      !isPlainObject(question) ||
      !hasExactKeys(question, ["type", "instructions", "criteria"]) ||
      question.type !== "choice" ||
      typeof question.instructions !== "string" ||
      !question.instructions.trim() ||
      !isPlainObject(question.criteria) ||
      !hasExactKeys(question.criteria, FIT_GROUPS) ||
      FIT_GROUPS.some(
        (group) =>
          typeof question.criteria[group] !== "string" ||
          !question.criteria[group].trim(),
      )
    ) {
      fail("JEV_QUESTIONS_INVALID");
    }
  }
  assertNoSensitiveOutboundData(request.state);
}

function validateBridgeCandidate(candidate, providerCandidate, index) {
  if (
    !isPlainObject(candidate) ||
    candidate.resourcePool !== "local" ||
    !["anime", "drama", "movie"].includes(candidate.mediaType) ||
    typeof candidate.identityKey !== "string" ||
    !candidate.identityKey ||
    typeof candidate.title !== "string" ||
    !candidate.title ||
    candidate.title !== providerCandidate.title ||
    (candidate.titleJa !== null && typeof candidate.titleJa !== "string") ||
    (candidate.coverUrl !== null && typeof candidate.coverUrl !== "string") ||
    (candidate.synopsis !== null && typeof candidate.synopsis !== "string") ||
    candidate.synopsis !== providerCandidate.synopsis ||
    (candidate.year !== null && !Number.isInteger(candidate.year)) ||
    !Array.isArray(candidate.tags) ||
    JSON.stringify(candidate.tags) !== JSON.stringify(providerCandidate.tags) ||
    ![null, "watching", "planning", "completed", "onhold", "dropped"].includes(
      candidate.watchStatus,
    ) ||
    typeof candidate.href !== "string" ||
    !candidate.href.startsWith("/") ||
    !["ready", "insufficient"].includes(candidate.metadataQuality) ||
    providerCandidate.candidate_id !== `candidate-${index + 1}`
  ) {
    fail("JEV_BRIDGE_CANDIDATE_INVALID");
  }
  return {
    localId: Number.isInteger(candidate.localId) ? candidate.localId : null,
    identityKey: candidate.identityKey,
    resourcePool: "local",
    mediaType: candidate.mediaType,
    title: candidate.title,
    titleJa: candidate.titleJa,
    coverUrl: candidate.coverUrl,
    synopsis: candidate.synopsis,
    year: candidate.year,
    tags: [...candidate.tags],
    watchStatus: candidate.watchStatus,
    href: candidate.href,
    metadataQuality: candidate.metadataQuality,
  };
}

function parseSignedRequest({
  payloadJson,
  signature,
  bridgeSecret,
  now,
  usedQueryIds,
}) {
  if (
    typeof payloadJson !== "string" ||
    Buffer.byteLength(payloadJson, "utf8") > MAX_BRIDGE_BYTES
  ) {
    fail("JEV_BRIDGE_PAYLOAD_INVALID");
  }
  verifySignature(payloadJson, signature, bridgeSecret);

  let envelope;
  try {
    envelope = JSON.parse(payloadJson);
  } catch {
    fail("JEV_BRIDGE_PAYLOAD_INVALID");
  }
  if (
    !isPlainObject(envelope) ||
    !hasExactKeys(envelope, [
      "schemaVersion",
      "queryId",
      "expiresAt",
      "requestSha256",
      "providerRequestJson",
      "candidates",
    ]) ||
    envelope.schemaVersion !== 1 ||
    typeof envelope.queryId !== "string" ||
    !/^[a-f0-9-]{36}$/iu.test(envelope.queryId) ||
    !Number.isInteger(envelope.expiresAt) ||
    envelope.expiresAt < now ||
    envelope.expiresAt > now + 65_000 ||
    typeof envelope.providerRequestJson !== "string" ||
    Buffer.byteLength(envelope.providerRequestJson, "utf8") > MAX_REQUEST_BYTES ||
    typeof envelope.requestSha256 !== "string" ||
    sha256(envelope.providerRequestJson) !== envelope.requestSha256 ||
    !Array.isArray(envelope.candidates) ||
    envelope.candidates.length < 1 ||
    envelope.candidates.length > 8
  ) {
    fail("JEV_BRIDGE_PAYLOAD_INVALID");
  }

  for (const [queryId, expiresAt] of usedQueryIds) {
    if (expiresAt < now) usedQueryIds.delete(queryId);
  }
  if (usedQueryIds.has(envelope.queryId)) fail("JEV_BRIDGE_REPLAYED");

  let providerRequest;
  try {
    providerRequest = JSON.parse(envelope.providerRequestJson);
  } catch {
    fail("JEV_PROVIDER_REQUEST_INVALID");
  }
  validateProviderRequest(providerRequest);
  const candidates = envelope.candidates.map((candidate, index) =>
    validateBridgeCandidate(
      candidate,
      providerRequest.state.candidates[index],
      index,
    ),
  );
  const nonEmptyProviderCandidates = providerRequest.state.candidates.filter(
    (candidate) => candidate.title,
  ).length;
  if (nonEmptyProviderCandidates !== candidates.length) {
    fail("JEV_BRIDGE_CANDIDATE_INVALID");
  }

  usedQueryIds.set(envelope.queryId, envelope.expiresAt);
  return { envelope, providerRequest, candidates };
}

function validateProviderResponse(data, request) {
  if (
    !isPlainObject(data) ||
    data.model !== MODEL_ID ||
    !isPlainObject(data.answers)
  ) {
    fail("JEV_RESULT_INVALID");
  }
  const expectedIds = Object.keys(request.questions).sort();
  const actualIds = Object.keys(data.answers).sort();
  if (JSON.stringify(expectedIds) !== JSON.stringify(actualIds)) {
    fail("JEV_RESULT_INVALID");
  }

  const answers = {};
  for (const id of expectedIds) {
    const answer = data.answers[id];
    if (
      !isPlainObject(answer) ||
      answer.type !== "choice" ||
      !FIT_GROUPS.includes(answer.choice) ||
      !isUnit(answer.confidence) ||
      !isPlainObject(answer.probabilities) ||
      !hasExactKeys(answer.probabilities, FIT_GROUPS) ||
      FIT_GROUPS.some((group) => !isUnit(answer.probabilities[group]))
    ) {
      fail("JEV_RESULT_INVALID");
    }
    const sum = FIT_GROUPS.reduce(
      (total, group) => total + answer.probabilities[group],
      0,
    );
    const maximum = Math.max(
      ...FIT_GROUPS.map((group) => answer.probabilities[group]),
    );
    if (
      Math.abs(sum - 1) > 0.02 ||
      answer.probabilities[answer.choice] < maximum - 1e-9
    ) {
      fail("JEV_RESULT_INVALID");
    }
    answers[id] = answer.choice;
  }

  const usage = data.usage === undefined
    ? { inputTokens: null, outputTokens: null }
    : isPlainObject(data.usage) &&
        isCount(data.usage.input_tokens) &&
        isCount(data.usage.output_tokens)
      ? {
          inputTokens: data.usage.input_tokens,
          outputTokens: data.usage.output_tokens,
        }
      : fail("JEV_RESULT_INVALID");
  return { answers, usage };
}

async function evaluateSignedMoodRequest({
  payloadJson,
  signature,
  bridgeSecret,
  getApiKey,
  fetchImpl,
  usedQueryIds = new Map(),
  now = Date.now(),
}) {
  if (typeof fetchImpl !== "function") fail("JEV_FETCH_UNAVAILABLE");
  if (typeof getApiKey !== "function") fail("JEV_KEY_NOT_CONFIGURED");
  const { envelope, providerRequest, candidates } = parseSignedRequest({
    payloadJson,
    signature,
    bridgeSecret,
    now,
    usedQueryIds,
  });
  const apiKey = getApiKey();
  if (
    typeof apiKey !== "string" ||
    apiKey.trim().length < 16 ||
    apiKey.trim().length > 1024 ||
    /\s/u.test(apiKey.trim())
  ) {
    fail("JEV_KEY_NOT_CONFIGURED");
  }

  let response;
  try {
    response = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        "Content-Type": "application/json",
      },
      body: envelope.providerRequestJson,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: "error",
    });
  } catch (error) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      fail("JEV_TIMEOUT");
    }
    fail("JEV_REQUEST_FAILED");
  }
  if (!response || typeof response.ok !== "boolean") {
    fail("JEV_HTTP_RESPONSE_INVALID");
  }
  if (!response.ok) fail(`JEV_HTTP_${response.status}`);

  let responseText;
  try {
    responseText = await response.text();
  } catch {
    fail("JEV_RESPONSE_INVALID");
  }
  if (Buffer.byteLength(responseText, "utf8") > MAX_RESPONSE_BYTES) {
    fail("JEV_RESPONSE_INVALID");
  }
  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    fail("JEV_RESPONSE_INVALID");
  }
  const validated = validateProviderResponse(data, providerRequest);
  const evaluatedCandidates = candidates.map((candidate, index) => ({
    ...candidate,
    fit: validated.answers[`candidate_${index + 1}_fit`],
  }));
  const groups = Object.fromEntries(
    FIT_GROUPS.map((group) => [
      group,
      evaluatedCandidates.filter((candidate) => candidate.fit === group),
    ]),
  );

  return {
    status: "evaluated",
    queryId: envelope.queryId,
    requestSha256: envelope.requestSha256,
    candidates: evaluatedCandidates,
    groups,
    usage: validated.usage,
  };
}

module.exports = {
  ENDPOINT,
  MODEL_ID,
  JevDirectError,
  evaluateSignedMoodRequest,
};
