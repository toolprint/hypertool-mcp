# Persona Integration with Server Tools

This document describes how personas integrate with the server tools system, focusing on the toolset bridge pattern and configuration tool workflows.

## Quick Reference

For the complete architecture overview, see: `../CLAUDE.md`

## Persona-Toolset Integration Flow

### 1. Persona Activation Process
```
Enhanced Server receives --persona flag →
├── PersonaManager.activatePersona(name)
├── Loads PersonaToolsets from persona.yaml
├── PersonaToolsetBridge.convertPersonaToolset()
├── ToolsetManager.setCurrentToolset() (if auto-activate)
└── Enhanced Server ready with persona tools
```

### 2. Configuration Tool Flow with Personas

#### list-saved-toolsets
```
Client calls list-saved-toolsets →
ConfigToolsManager.handleToolCall() →
ToolsetManager.listSavedToolsets() →
├── Load regular toolsets from preferences
├── getPersonaToolsets() via PersonaManager + Bridge
├── Combine with "persona:" prefix
└── Return: ["my-toolset", "persona:complex-persona-web-scraping"]
```

#### equip-toolset (Enhanced Flow)
```
Client calls equip-toolset name="persona:complex-persona-web-scraping" →
ConfigToolsManager.handleToolCall() →
ToolsetManager.equipToolset() →
├── Check preferences first (regular toolsets)
├── If not found + starts with "persona:"
│   ├── Extract persona name and toolset name
│   ├── PersonaManager.getPersonaToolsets()
│   ├── PersonaToolsetBridge.convertPersonaToolset()
│   └── setCurrentToolset() with converted config
└── Return success/error
```

## PersonaToolsetBridge Details

### Purpose
Converts between persona-simple and toolset-complex formats while maintaining compatibility with existing ToolsetManager infrastructure.

### Conversion Process
```typescript
// Input: PersonaToolset (from persona.yaml)
{
  name: "web-scraping",
  toolIds: ["playwright.navigate", "playwright.screenshot"]
}

// Output: ToolsetConfig (for ToolsetManager)
{
  name: "persona-complex-persona-web-scraping",
  description: "Toolset 'web-scraping' from persona 'complex-persona'...",
  version: "1.0.0",
  tools: [
    { namespacedName: "playwright.navigate" },
    { namespacedName: "playwright.screenshot" }
  ]
}
```

### Bridge Options
```typescript
interface BridgeOptions {
  validateTools?: boolean;        // Check if tools exist (default: true)
  allowPartialToolsets?: boolean; // Allow missing tools (default: false)  
  namePrefix?: string;           // Prefix for names (default: "persona")
  includeMetadata?: boolean;     // Add descriptions (default: true)
}
```

## Persona Naming Conventions

### Toolset Names
- **Format**: `persona:{personaName}-{toolsetName}`
- **Examples**: 
  - `persona:complex-persona-web-scraping`
  - `persona:dev-tools-git-workflow`

### Name Resolution
```typescript
// Parse persona toolset name
const parsePersonaToolsetName = (name: string) => {
  if (!name.startsWith("persona:")) return null;
  
  const withoutPrefix = name.substring("persona:".length);
  const parts = withoutPrefix.split("-");
  
  // Find persona name (directory name)
  // toolset name is everything after persona name
  return { personaName, toolsetName };
};
```

## Integration Points

### ToolsetManager Enhancements

#### New Methods
```typescript
// Set persona manager reference
setPersonaManager(personaManager: PersonaManager): void

// Get persona toolsets for listing
private async getPersonaToolsets(): Promise<ToolsetInfo[]>

// Load toolset from persona (for equipping)  
private async loadPersonaToolset(name: string): Promise<ToolsetConfig | null>
```

#### Enhanced Methods
```typescript
// Now handles both regular and persona toolsets
async equipToolset(name: string): Promise<EquipToolsetResponse>

// Prevents deletion of persona toolsets
async deleteToolset(name: string): Promise<DeleteToolsetResponse>

// Already includes persona toolsets
async listSavedToolsets(): Promise<ListToolsetsResponse>
```

### Configuration Tools Impact

#### Tool Visibility Based on Mode

**In Standard Mode (no persona active):**
- `list-personas` - Not shown (persona system not in use)
- All other configuration tools are available

**In Persona Mode (persona active):**
- `build-toolset` - Hidden (persona toolsets are read-only)
- `delete-toolset` - Hidden (cannot delete persona toolsets)

#### Available Tools in Persona Mode
These tools remain available and work with persona toolsets:
- `list-personas` - Shows available personas (for switching/viewing)
- `list-saved-toolsets` - Shows persona toolsets with "persona:" prefix
- `equip-toolset` - Works with persona toolset names
- `get-active-toolset` - Shows active persona toolset
- `unequip-toolset` - Unequips current persona toolset
- `add-tool-annotation` - Add notes to tools in persona toolsets
- `list-available-tools` - Shows tools from connected servers

#### Key Benefits
1. **Context-aware interface** - Only shows relevant operations
2. **Unified user experience** across toolset types
3. **Clear distinction** with "persona:" prefix
4. **Prevents invalid operations** by hiding unavailable tools

## Error Handling

### Common Scenarios
```typescript
// Persona not found
equip-toolset "persona:missing-persona-toolset"
→ Error: "Persona 'missing-persona' not found"

// Toolset not found in persona  
equip-toolset "persona:complex-persona-missing-toolset"
→ Error: "Toolset 'missing-toolset' not found in persona 'complex-persona'"

// Cannot delete persona toolset
delete-toolset "persona:complex-persona-web-scraping"  
→ Error: "Cannot delete persona toolsets"

// Partial toolset with missing tools
→ Warning: "2 tools could not be resolved, equipped partial toolset"
```

## Development Guidelines

### Adding Persona Support to Tools

#### Do ✅
- Use ToolsetManager's unified interface
- Handle "persona:" prefix appropriately  
- Provide clear error messages
- Test with both toolset types

#### Don't ❌
- Call PersonaManager directly from config tools
- Assume toolset source (regular vs persona)
- Break existing functionality
- Expose internal bridge/conversion logic

### Testing Scenarios
1. **List toolsets** with both regular and persona toolsets
2. **Equip regular toolset** then **equip persona toolset**
3. **Try to delete persona toolset** (should fail)
4. **Equip non-existent persona toolset** (should fail gracefully)
5. **Switch between personas** and verify toolset availability

## Future Enhancements

### Potential Improvements
- **Dynamic toolset updates** when persona changes
- **Toolset dependencies** between personas
- **Custom toolset validation** rules per persona
- **Toolset inheritance** from parent personas

### Architectural Considerations
- **Maintain single responsibility** - ToolsetManager for operations, PersonaManager for data
- **Keep bridge pattern** for format conversion
- **Preserve unified interface** for configuration tools
- **Plan for additional toolset sources** (remote, database, etc.)

This integration pattern ensures that personas work seamlessly with the existing toolset infrastructure while maintaining clean separation of concerns and providing a unified user experience.