"""Export supported reconstructed UT worlds as declarative browser rules.

No Python code or treasure placement is sent to the browser. Unsupported rules
raise an error rather than producing an incomplete graph.
"""
import ast
import inspect
import math

RULES = {}


def simplify(expr):
    import json
    op = expr[0]
    if op == 'call' and expr[1] == 'has' and len(expr[2]) > 2 and expr[2][2][0] == 'literal' and expr[2][2][1] <= 0:
        return ['literal',True]
    if op in ('and','or'):
        children=[]
        for child in expr[1]:
            child=simplify(child)
            if child[0]=='literal':
                if bool(child[1]) == (op=='or'):return child
                continue
            children.extend(child[1] if child[0]==op else [child])
        unique={json.dumps(x,sort_keys=True):x for x in children}
        children=[unique[key] for key in sorted(unique)]
        if not children:return ['literal',op=='and']
        if len(children)==1:return children[0]
        return [op,children]
    if op=='if':return [op,expr[1],simplify(expr[2]),simplify(expr[3])]
    return expr


def install_capture():
    from worlds.AutoWorld import AutoWorldRegister
    import importlib
    cls = AutoWorldRegister.world_types.get('Paper Mario')
    if cls:
        module = importlib.import_module(cls.__module__ + '.RuleParser')
        original = module.Rule_AST_Transformer.make_access_rule
        def capture(self, body):
            fn = original(self, body)
            RULES[fn] = body
            return fn
        module.Rule_AST_Transformer.make_access_rule = capture


def node(expr):
    if isinstance(expr, ast.Constant):
        return ['literal', expr.value]
    if isinstance(expr, (ast.List, ast.Tuple, ast.Set)):
        return ['list', [node(x) for x in expr.elts]]
    if isinstance(expr, ast.BoolOp):
        return ['or' if isinstance(expr.op, ast.Or) else 'and', [node(x) for x in expr.values]]
    if isinstance(expr, ast.UnaryOp) and isinstance(expr.op, ast.Not):
        return ['not', node(expr.operand)]
    if isinstance(expr, ast.Compare):
        ops = {ast.GtE:'ge', ast.Gt:'gt', ast.LtE:'le', ast.Lt:'lt', ast.Eq:'eq', ast.NotEq:'ne'}
        return ['compare', node(expr.left), [ops[type(op)] for op in expr.ops], [node(x) for x in expr.comparators]]
    if isinstance(expr, ast.BinOp):
        ops = {ast.Add:'add', ast.Sub:'sub', ast.Mult:'mul', ast.FloorDiv:'div', ast.Mod:'mod'}
        return ['math', ops[type(expr.op)], node(expr.left), node(expr.right)]
    if isinstance(expr, ast.Call) and isinstance(expr.func, ast.Attribute) and isinstance(expr.func.value, ast.Name) and expr.func.value.id == 'state':
        allowed = {'has','has_all','has_any','count','has_group','has_group_unique','count_group','count_group_unique',
                   'has_from_list','has_from_list_unique','count_from_list','count_from_list_unique',
                   'can_reach','can_reach_region','can_reach_location','can_reach_entrance'}
        if expr.func.attr not in allowed:
            raise ValueError(f'Unsupported state predicate {expr.func.attr}')
        return ['call', expr.func.attr, [node(x) for x in expr.args], {kw.arg:node(kw.value) for kw in expr.keywords}]
    raise ValueError(f'Unsupported rule AST {ast.dump(expr)}')


def rule(fn):
    if fn in RULES:
        return node(RULES[fn])
    if fn.__module__ == 'worlds.generic.Rules' and fn.__qualname__.startswith('add_rule.'):
        closure = inspect.getclosurevars(fn).nonlocals
        mode = 'or' if any(x.opname=='POP_JUMP_IF_TRUE' for x in __import__('dis').get_instructions(fn)) else 'and'
        return [mode,[rule(closure['rule']),rule(closure['old_rule'])]]
    obj = getattr(fn, '__self__', None)
    if obj is not None and type(obj).__name__ == 'LogicObject':
        if not obj.requirements:
            return ['literal', True]
        from importlib import import_module
        placeholders = import_module(type(obj).__module__).placeholder_names
        branches = []
        o = obj.options
        for items, energy, missiles, bombs, enabled in zip(obj.requirements, obj.energy_tanks, obj.missile_ammo, obj.power_bomb_ammo, obj.yaml_enabled):
            if not enabled:
                continue
            if energy > 0:
                if o.ElevatorShuffle.value > o.ElevatorShuffle.option_none: energy //= 2
                if o.CombatDifficulty >= o.CombatDifficulty.option_expert: energy //= 2
            if missiles > 0:
                if o.CombatDifficulty.value == o.CombatDifficulty.option_beginner: missiles = math.ceil(missiles * 1.25)
                elif o.CombatDifficulty.value == o.CombatDifficulty.option_advanced: missiles = math.ceil(missiles * 1.1)
                missiles -= o.MissileDataAmmo.value
                if o.MissileTankAmmo.value > 0: missiles = math.ceil(missiles / o.MissileTankAmmo.value)
            if bombs > 0:
                bombs -= o.PowerBombDataAmmo.value
                if o.PowerBombTankAmmo.value > 0: bombs = math.ceil(bombs / o.PowerBombTankAmmo.value)
            needed = {name:1 for name in items - placeholders}
            for name,count in [('Energy Tank',energy),('Missile Tank',missiles),('Power Bomb Tank',bombs)]:
                needed[name] = max(needed.get(name,0),count)
            branches.append(['and', [['call','has',[['literal',name],['literal',obj.player],['literal',count]],{}] for name,count in sorted(needed.items())]])
        return ['or',branches]
    # Only constant default rules are accepted here; lambdas with inventory
    # checks must have an explicit serializer rather than guessed behavior.
    instructions = list(__import__('dis').get_instructions(fn))
    real = [x for x in instructions if x.opname not in ('RESUME','CACHE','NOP')]
    if len(real)==1 and real[0].opname=='RETURN_CONST' and isinstance(real[0].argval,bool):
        return ['literal',real[0].argval]
    if len(real) == 2 and real[0].opname == 'LOAD_CONST' and real[1].opname == 'RETURN_VALUE' and isinstance(real[0].argval,bool):
        return ['literal',real[0].argval]
    return trace_rule(fn)


def trace_rule(fn):
    # Exhaustively explore Boolean predicate outcomes, not sampled inventories.
    # Python's short-circuit evaluation is retained as a conditional rule tree.
    class Query(Exception):
        def __init__(self, expr): self.expr=expr
    total = 0
    class State:
        def __init__(self, answers): self.answers=answers
        def ask(self, expr):
            key=repr(expr)
            if key not in self.answers: raise Query(expr)
            return self.answers[key]
        def has(self, item, player, count=1):
            if count<=0:return True
            return self.ask(['call','has',[['literal',item],['literal',player],['literal',count]],{}])
        def has_all(self, items, player): return all(self.has(x,player) for x in items)
        def has_any(self, items, player): return any(self.has(x,player) for x in items)
        def can_reach(self, name, resolution_hint=None, player=None):
            if not isinstance(name,str):
                resolution_hint=type(name).__name__;name=name.name
            return self.ask(['call','can_reach',[['literal',name],['literal',resolution_hint],['literal',player]],{}])
    def walk(answers):
        nonlocal total
        total+=1
        if total>20000:raise ValueError(f'Rule is too large to export safely: {fn}')
        try:return ['literal',bool(fn(State(answers)))]
        except Query as q:
            yes=walk(dict(answers,**{repr(q.expr):True}))
            no=walk(dict(answers,**{repr(q.expr):False}))
            return yes if yes==no else ['if',q.expr,yes,no]
    return walk({})


def export(core, data):
    world = core.get_current_world()
    player = core.player_id
    locations = []
    edges = []
    for region in core.multiworld.get_regions(player):
        for loc in region.locations:
            spec = {'name':loc.name,'region':region.name,'id':loc.address,'rule':simplify(rule(loc.access_rule))}
            if loc.address is None and loc.item is not None:
                spec['event'] = loc.item.name
            locations.append(spec)
        for edge in region.exits:
            if edge.connected_region is None:
                raise ValueError('Unconnected entrance cannot be exported.')
            edges.append({'name':edge.name,'from':region.name,'to':edge.connected_region.name,'rule':simplify(rule(edge.access_rule))})
    item_rules = {}
    from BaseClasses import CollectionState
    for name,code in world.item_name_to_id.items():
        item = world.create_item(name)
        item_rules[str(code)] = {'name':name,'progression':item.advancement}
    return {'schema':'ap-browser-graph-v1','seed':data['seed'],'team':data['team'],'slot':data['slot'],
            'game':data['game'],'slot_data':data['slotData'],'package':data['packages'][data['game']],
            'origin':world.origin_region_name,'player':player,
            'regions':sorted(r.name for r in core.multiworld.get_regions(player)),
            'locations':locations,'edges':edges,'items':item_rules,
            'groups':{key:sorted(value) for key,value in world.item_name_groups.items()},
            'collection': 'paper-mario' if data['game']=='Paper Mario' else 'standard'}
