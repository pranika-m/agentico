import re

# Matches standard WhatsApp export format:
# "12/06/2026, 14:32 - John Doe: Hey, when will my order arrive?"
PATTERN = r"(\d{1,2}/\d{1,2}/\d{2,4}, \d{1,2}:\d{2}\s?[APap]?[Mm]?) - (.*?): (.*)"

def parse_whatsapp_export(text: str) -> dict:
    contacts = {}
    for match in re.finditer(PATTERN, text):
        timestamp, sender, message = match.groups()
        if sender not in contacts:
            contacts[sender] = []
        contacts[sender].append({"time": timestamp, "message": message})

    summary = {}
    for sender, messages in contacts.items():
        summary[sender] = {
            "message_count": len(messages),
            "last_contact": messages[-1]["time"],
            "last_message": messages[-1]["message"],
            "messages": messages,  # full conversation history for this contact
        }
    return summary
