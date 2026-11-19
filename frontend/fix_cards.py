import os
import re

TARGET_DIR = "/home/priyanshu/Desktop/PROJECTS/mini new/main/mini/frontend/src"

GLASS_CARD_REGEX = re.compile(r'<Card className="glass-card[^"]*"(.*?)>((\n|.)*?)</Card>')

# For existing glassmorphism replacements we did manually earlier
OLD_STYLE_1 = 'bg-white/80 dark:bg-slate-900/80 backdrop-blur-md'
NEW_STYLE_1 = 'bg-white dark:bg-[#0d1b2e]'

OLD_STYLE_2 = 'bg-slate-50/80 dark:bg-white/[0.04] backdrop-blur'
NEW_STYLE_2 = 'bg-slate-50 dark:bg-[#0a1526]' # Slightly darker variant for inner pills if needed, or we can just use #0d1b2e

OLD_STYLE_3 = 'bg-slate-50 dark:bg-white/[0.03]'
NEW_STYLE_3 = 'bg-slate-50 dark:bg-[#0a1526]'

def convert_card_match(match):
    attrs = match.group(1)
    content = match.group(2)
    # Give it the new solid dark style explicitly
    new_start = f'<div className="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#0d1b2e] shadow-sm"{attrs}>'
    new_end = '</div>'
    
    # We also need to strip out <CardHeader>, <CardContent>, <CardTitle> tags but leave content!
    # A simpler way is to just leave them (they render as divs with padding) but maybe they don't look perfect.
    return new_start + content + new_end


def replace_in_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    
    new_content = content
    
    # Replace explicit glassmorphism classes we added with solid [#0d1b2e]
    new_content = new_content.replace(OLD_STYLE_1, NEW_STYLE_1)
    new_content = new_content.replace(OLD_STYLE_2, NEW_STYLE_2)
    new_content = new_content.replace(OLD_STYLE_3, NEW_STYLE_3)
    
    # Replace <Card className="glass-card"> with our custom div
    new_content = re.sub(r'<Card className="glass-card[^"]*"(.*?)>', r'<div className="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-[#0d1b2e] shadow-sm flex flex-col"\1>', new_content)
    new_content = new_content.replace('</Card>', '</div>')
    
    # Also replace <CardContent> and <CardHeader> with plain divs to keep the layout roughly same but avoid importing
    new_content = re.sub(r'<CardContent([^>]*)>', r'<div\1>', new_content)
    new_content = new_content.replace('</CardContent>', '</div>')
    
    new_content = re.sub(r'<CardHeader([^>]*)>', r'<div\1>', new_content)
    new_content = new_content.replace('</CardHeader>', '</div>')
    
    new_content = re.sub(r'<CardTitle([^>]*)>', r'<h3\1>', new_content)
    new_content = new_content.replace('</CardTitle>', '</h3>')
    
    if new_content != content:
        # Also clean up imports if any
        new_content = re.sub(r'import \{[^}]*Card[^}]*\} from "@/components/ui/card";\n?', '', new_content)
        with open(filepath, 'w') as f:
            f.write(new_content)
        print(f"Updated: {filepath}")

for root, _, files in os.walk(TARGET_DIR):
    for filename in files:
        if filename.endswith(".tsx"):
            filepath = os.path.join(root, filename)
            replace_in_file(filepath)

print("Done.")
