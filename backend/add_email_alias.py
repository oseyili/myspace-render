from pathlib import Path

p = Path("hotel_app.py")
s = p.read_text(encoding="utf-8")

alias = '''

# Compatibility wrapper: old routes may still call this name
def send_reservation_email(payload):
    class Obj:
        pass

    obj = Obj()

    if isinstance(payload, dict):
        for k, v in payload.items():
            setattr(obj, k, v)
    else:
        obj = payload

    return send_availability_email(obj)
'''

if "def send_reservation_email(payload):" not in s:
    s = s + alias + "\n"

p.write_text(s, encoding="utf-8")
print("Compatibility email alias added.")
