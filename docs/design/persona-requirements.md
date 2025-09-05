> @agent-backend-architect please help me design a content loading system and schema for a "persona" content type.  we will iterate on a plan for the design until I approve it.
    When approved, the ONLY task you have will be to write it down in docs/design/persona-content-pack.md

  A "persona" comprises of a few things:
  - a named folder that matches the 'name' of the persona in it's metadata
  - in the folder is required to be a persona.yaml or persona.yml file with a given schema
  - in the folder it is optional to provide a mcp.json file with a given schema
  - in the future other assets will be allowed to be bundled in
  - in the future the folder will be allowed to be compressed into a ZIP archive with the extension .htp (stands for HyperTool Persona)

  The mcp.json follows the "mcp config format" referenced in this repo and on Model Context Protocol documentation from Anthropic

  The persona.yaml schema has the following:
  - name (required, hypen delimited all lowercase restricted to start)
  - description (required, with minimum text)
  - toolsets:  (optional, an array of named toolset schema objects)
  - defaultToolset: optional, the name of the default toolset, must be present in the toolsets array

  toolset schema object:
  - name: (required, hyphen delimited all lowercase to start)
  - toolIds: (required at least 1, array of tool identifiers as expressed in this project with the mcp server name as a prefix)

  The goal is to provide a series of folders with content that matches this pattern locally and the ability to load them in on application start to configure the hypertool
  server
