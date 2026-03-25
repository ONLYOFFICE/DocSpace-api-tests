export function parseSseEvents(data: unknown) {
  const sseData = data as string;
  const events = sseData.split("\n\n").filter((block: string) => block.trim());

  const parseEvent = (block: string) => {
    const eventMatch = block.match(/^event:\s*(.+)$/m);
    const dataMatch = block.match(/^data:\s*(.+)$/m);
    return {
      event: eventMatch?.[1],
      data: dataMatch ? JSON.parse(dataMatch[1]) : null,
    };
  };

  const parsed = events.map(parseEvent);
  return {
    parsed,
    messageStart: parsed.find((e) => e.event === "message_start"),
    messageStop: parsed.find((e) => e.event === "message_stop"),
    tokens: parsed.filter((e) => e.event === "new_token"),
  };
}
