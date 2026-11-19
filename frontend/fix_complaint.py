with open("/home/priyanshu/Desktop/PROJECTS/mini new/main/mini/frontend/src/pages/citizen/ComplaintDetail.tsx", "r") as f:
    text = f.read()

# I will replace all `</Card>` with `</div>` locally
text = text.replace('</Card>', '</div>')

# Now put back `</Card>` where it belongs!
# Here are the places where it belongs based on structure:
"""
77 |      <div className="grid md:grid-cols-3 gap-4">
78 |        <Card className="glass-card">
...
110 |        </Card>
"""
# So instead of complicated string replacement, I can just write what JSX should look like.
# Actually, let's fix it manually by writing the fixed file content.
