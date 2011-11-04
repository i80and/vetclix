#!/usr/bin/env python
import sexp

tests = {
	'integer atom': (r'9053', 9053, lambda parsed: isinstance(parsed, int)),
	'float atom': (r'30.54', 30.54, lambda parsed: isinstance(parsed, float)),
	'string atom': (r'"This is the tale of an \"elephant\""', 'This is the tale of an "elephant"'),
	'empty string atom': (r'""', ''),
	'empty list': (r'()', []),
	'complex list': (r'(25.9 "Foobar" 40 ("nice b\"ob" ("foo" 40) "bar"))', [25.9, 'Foobar', 40, ['nice b"ob', ['foo', 40], 'bar']])
}


def test_generator():
	def testcase(test):
		def inner():
			print(test)
			str_form = test[0]
			parsed_form = test[1]

			parsed = sexp.parse(str_form)
			dumped = sexp.dump(parsed_form)
			assert parsed == parsed_form
			assert dumped == str_form
			assert sexp.dump(sexp.parse(dumped)) == dumped

			# Extra test if provided
			if len(test) > 2:
				assert test[2](parsed)
		return inner

	for test in tests:
		yield testcase(tests[test])


def test_abornal_seperators():
	parsed = sexp.parse(r'("foo""bar" (90(30)))')
	assert parsed == ['foo', 'bar', [90, [30]]]


def test_unclosed_list_1():
	error = False
	try:
		parsed = sexp.parse(r'(40 (30')
	except(sexp.UnclosedList):
		error = True
	assert error


def test_unclosed_list_2():
	error = False
	try:
		parsed = sexp.parse(r'("Foobar" ("this" "is")')
	except(sexp.UnclosedList):
		error = True
	assert error


def test_unmatched_closing_paren():
	# XXX: Unmatched closing parens are currently silently ignored.  This is a bug,
	# but we don't want behavior changing unexpectedly
	print('Testing against unmatched closing paren behavior change')
	parsed = sexp.parse(r'())')
	assert parsed == []

	print('Testing maplist')
	parsed = sexp.parse(r'(("key" "value1" "value2") ("key2" "value"))')
	assert sexp.maplist(parsed) == {'key': ['value1', 'value2'], 'key2': 'value'}

	print('Testing structure')
	parsed = ['client', 'Bobby Tables', ['396-555-3213', 'bobtables@example.com']]
	assert sexp.structure(parsed, ['type', 'name', 'contact']) == {'type': 'client', 'name': 'Bobby Tables', 'contact': ['396-555-3213', 'bobtables@example.com']}
