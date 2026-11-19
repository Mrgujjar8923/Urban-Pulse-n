import re

filepath = "/home/priyanshu/Desktop/PROJECTS/mini new/main/mini/frontend/src/components/shared/ProfileSettings.tsx"
with open(filepath, 'r') as f:
    text = f.read()

# I will replace the last </div> before the specific markers with </Card>
text = text.replace('</div>\n\n      {/* Editable Details */}', '</Card>\n\n      {/* Editable Details */}')
text = text.replace('</div>\n\n      {/* Password Update */}', '</Card>\n\n      {/* Password Update */}')
text = text.replace('</div>\n    </motion.div>', '</Card>\n    </motion.div>')

with open(filepath, 'w') as f:
    f.write(text)
