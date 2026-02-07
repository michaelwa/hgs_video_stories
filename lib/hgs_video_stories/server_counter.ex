defmodule HgsVideoStories.ServerCounter do
  @moduledoc false

  use Agent

  @spec start_link(any) :: {:ok, pid}
  def start_link(_opts) do
    Agent.start_link(fn -> 0 end, name: __MODULE__)
  end

  @spec get() :: integer
  def get do
    Agent.get(__MODULE__, & &1)
  end

  @spec set(integer) :: integer
  def set(new_count) when is_integer(new_count) do
    Agent.get_and_update(__MODULE__, fn _count -> {new_count, new_count} end)
  end
end
