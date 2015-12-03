var cache = require('../lib/cache')

describe('cache', function() {

  beforeEach(function() {
    cache.init();
  })

  afterEach(function() {
    cache.reset()
  })

  it('set/get value', function() {
    //given
    var key = 'key'
    var value = 2390
    cache.set(key, value)

    //when
    var result = cache.get(key)

    //then
    expect(result).to.eql(value)
  })

  it('itemcount', function() {
    //given
    var key = 'key'
    var value = 2390
    cache.set(key, value)

    //when
    var result = cache.itemCount()

    //then
    expect(result).to.eql(1)
  })

  it('get/peek value', function() {
    //given
    var key = 'key'
    var value = 2390
    cache.set(key, value)

    //when
    var result = cache.peek(key)

    //then
    expect(result).to.eql(value)
  })

  it('delete value', function() {
    //given
    var key = 'key'
    var value = 2390
    cache.set(key, value)
    cache.del(key)

    //when
    var result = cache.peek(key)

    //then
    expect(result).to.eql(undefined)
  })

  it('reset cache', function() {
    //given
    var key = 'key'
    var value = 2390
    cache.set(key, value)
    cache.reset()

    //when
    var result = cache.peek(key)

    //then
    expect(result).to.eql(undefined)
  })

  it('get undefined value', function() {
    //given
    var key = 'key'

    //when
    var result = cache.get(key)

    //then
    expect(result).to.eql(undefined)
  })

})
