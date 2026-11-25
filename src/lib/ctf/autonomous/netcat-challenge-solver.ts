/**
 * Builds a self-contained, bounded Python driver for interactive netcat
 * challenges. It runs entirely inside the Kali container through the existing
 * terminal manager. The driver reads every prompt, records each step, replies
 * to known transform hints, presses Enter at "press enter" prompts, and stops
 * as soon as a flag-shaped value appears.
 */

const PYTHON_SOLVER = String.raw`import re,socket,time
H=__HOST__
P=__PORT__
PROMPT='Enter the Linux command to reverse it:'
PRESS=re.compile(r'press\s+enter|tekan\s+enter|continue\.\.\.|\[enter\]',re.I)
FLAG=re.compile(r'(?:academy|cyla|picoCTF|flag|ctf)\{[^{}\r\n]{1,200}\}',re.I)
RULES=[
 (r'base\s*64',['base64 -d']),
 (r'base\s*32',['base32 -d']),
 (r'revers|dibalik|terbalik',['rev']),
 (r'underscore|dashes|dash|garis.*bawah',["tr '-' '_'","tr '_' '-'"]),
 (r'curly|parenthes|braces|kurawal',["tr '()' '{}'","tr '{}' '()'"]),
 (r'\bhex\b|heksadesimal',['xxd -r -p']),
 (r'rot\s*13',["tr 'A-Za-z' 'N-ZA-Mn-za-m'"]),
 (r'atbash',["tr 'A-Za-z' 'ZYXWVUTSRQPONMLKJIHGFEDCBAzyxwvutsrqponmlkjihgfedcba'"]),
]
FALLBACK=['base64 -d','rev',"tr '-' '_'","tr '()' '{}'","tr 'A-Za-z' 'N-ZA-Mn-za-m'",'base32 -d','cat']
def sw(c):
 m=re.match(r"^tr\s+'([^']*)'\s+'([^']*)'$",c.strip())
 return "tr '%s' '%s'"%(m.group(2),m.group(1)) if m else None
def cand(h):
 out=[]
 m=re.search(r'Try reversing:\s*(.+)$',h,re.I)
 if m:
  out.append(m.group(1).strip())
  s=sw(out[-1])
  if s:out.append(s)
 for p,cs in RULES:
  if re.search(p,h,re.I):out.extend(cs)
 out.extend(FALLBACK)
 seen=set();res=[]
 for x in out:
  if x not in seen:seen.add(x);res.append(x)
 return res
s=socket.create_connection((H,P),timeout=10)
s.settimeout(6)
buf='';n=0;step=0;tried=set();out=[];deadline=time.time()+55;last_enter=''
while time.time()<deadline and n<40:
 try:d=s.recv(8192).decode('utf8','replace')
 except socket.timeout:
  if buf.strip():out.append('\n>>> menunggu balasan server berhenti\n')
  break
 if not d:break
 buf+=d;out.append(d)
 if FLAG.search(''.join(out)):break
 while PROMPT in buf:
  pre,buf=buf.split(PROMPT,1)
  hs=re.findall(r'Hint:\s*(.*)',pre);h=hs[-1].strip() if hs else ''
  ss=re.findall(r'--- Step (\d+) ---',pre);cur=int(ss[-1]) if ss else step
  if cur!=step:step=cur;tried=set()
  c=next((x for x in cand(h) if x not in tried),None)
  if not c:break
  tried.add(c)
  out.append('\n>>> step %d hint=%r send=%r\n'%(step,h,c))
  s.sendall((c+'\n').encode());n+=1
 if n>=40 or FLAG.search(''.join(out)):break
 tail=buf[-4000:]
 if PRESS.search(tail) and tail!=last_enter:
  last_enter=tail
  out.append('\n>>> step auto send=Enter\n')
  s.sendall(b'\n');n+=1
  buf=''
try:s.close()
except Exception:pass
print(''.join(out))
`;

export function buildNetcatSolverCommand(host: string, port: number): string {
  if (!/^[A-Za-z0-9.-]+$/.test(host)) throw new Error("Host nc tidak valid.");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Port nc tidak valid.");
  const script = PYTHON_SOLVER.replace("__HOST__", `'${host}'`).replace("__PORT__", String(port));
  const encoded = Buffer.from(script, "utf8").toString("base64");
  return `printf '%s' '${encoded}' | base64 -d | python3`;
}
